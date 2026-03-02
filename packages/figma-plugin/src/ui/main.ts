import "./styles.css";

import type {
  PluginToUiMessage,
  TaskEntry,
  TaskStatus,
} from "../shared/messages";
import {
  api,
  clearReviewEntries,
  clearTasks,
  deleteReviewEntry,
  deleteTask,
  getReviewEntries,
  getTasks,
  linkReviewEntry,
  updateReviewEntry,
  updateTask,
} from "./api/client";
import { postToSandbox, attachPluginBridge } from "./bridge/plugin-bridge";
import { bindEvents } from "./events/actions";
import { renderModal } from "./render/modal";
import {
  renderBuildView,
  renderNavbar,
  renderReviewView,
  renderServerView,
} from "./render/views";
import { renderSettingsView } from "./render/settings";
import { createInitialState, saveSettings, type AppState } from "./state/store";

const HEALTH_INTERVAL = 3000;
const SELECTION_INTERVAL = 500;

const state = createInitialState();

function formatEntry(entry: TaskEntry): string {
  if ((entry.type ?? "build") === "review") {
    return `- ${entry.figmaNodeName || "Unlinked"} (${entry.dataCid || "no-cid"})\n  Status: ${entry.status}\n  Comment: ${entry.comment || ""}`;
  }

  return `- ${entry.figmaNodeName || "Unnamed"} (${entry.figmaNodeId || "no-id"})\n  Status: ${entry.status}\n  Comment: ${entry.comment || ""}`;
}

function formatEntryJson(
  nodeId: string | undefined,
  nodeName: string,
  comment: string,
  status: TaskStatus,
): string {
  return JSON.stringify(
    {
      figmaNodeId: nodeId || "",
      figmaNodeName: nodeName,
      comment: comment || "",
      status,
    },
    null,
    2,
  );
}

function serializeEntries(entries: TaskEntry[]): string {
  return JSON.stringify(entries || []);
}

function captureFocus(): {
  id: string;
  start: number | null;
  end: number | null;
} | null {
  const active = document.activeElement;
  if (!active || !(active instanceof HTMLElement) || !active.id) {
    return null;
  }

  if (
    !(active instanceof HTMLInputElement) &&
    !(active instanceof HTMLTextAreaElement)
  ) {
    return null;
  }

  return {
    id: active.id,
    start: active.selectionStart,
    end: active.selectionEnd,
  };
}

function restoreFocus(
  focusState: { id: string; start: number | null; end: number | null } | null,
): void {
  if (!focusState) {
    return;
  }

  const element = document.getElementById(focusState.id);
  if (
    !element ||
    (!(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement))
  ) {
    return;
  }

  element.focus();
  if (
    typeof focusState.start === "number" &&
    typeof focusState.end === "number"
  ) {
    element.setSelectionRange(focusState.start, focusState.end);
  }
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error("Clipboard copy is unavailable");
  }
}

function isTaskStatus(value: string): value is TaskStatus {
  return ["to-build", "to-fix", "review", "completed"].includes(value);
}

function readModalStatus(): TaskStatus {
  const statusInput = document.getElementById(
    "modal-status",
  ) as HTMLSelectElement | null;
  const rawStatus = statusInput ? statusInput.value : state.modal?.status;

  if (rawStatus && isTaskStatus(rawStatus)) {
    return rawStatus;
  }

  return "to-build";
}

function render(): void {
  const app = document.getElementById("app");
  if (!app) {
    return;
  }

  const focusState = captureFocus();
  let content = "";

  if (state.currentView === "server") {
    content = renderServerView();
  } else if (state.currentView === "review") {
    content = renderReviewView(state);
  } else if (state.currentView === "settings") {
    content = renderNavbar(state) + renderSettingsView(state);
  } else {
    content = renderBuildView(state);
  }

  app.innerHTML = `<div class="app-root">${content}${renderModal(state)}</div>`;
  bindEvents({
    onAction: handleAction,
    onNameInput: (value) => {
      if (!state.modal) return;
      state.modal.name = value;
    },
    onCommentInput: (value) => {
      if (!state.modal) return;
      state.modal.comment = value;
    },
    onStatusInput: (value) => {
      if (!state.modal || !isTaskStatus(value)) return;
      state.modal.status = value;
    },
  });
  restoreFocus(focusState);
}

function startSelectionPolling(): void {
  stopSelectionPolling();
  postToSandbox({ type: "POLL_SELECTION" });
  state.selectionTimer = setInterval(() => {
    postToSandbox({ type: "POLL_SELECTION" });
  }, SELECTION_INTERVAL);
}

function stopSelectionPolling(): void {
  if (state.selectionTimer) {
    clearInterval(state.selectionTimer);
    state.selectionTimer = null;
  }
}

function requestThumbnails(entries: TaskEntry[]): void {
  entries.forEach((entry) => {
    if (!entry.figmaNodeId) {
      return;
    }

    if (state.thumbnails[entry.figmaNodeId] !== undefined) {
      return;
    }

    postToSandbox({
      type: "EXPORT_THUMBNAIL",
      nodeId: entry.figmaNodeId,
    });
  });
}

async function refreshTasks(): Promise<boolean> {
  const before = serializeEntries(state.entries);
  state.entries = await getTasks();
  const after = serializeEntries(state.entries);
  requestThumbnails(state.entries);
  return before !== after;
}

async function refreshReviewEntries(): Promise<boolean> {
  const before = serializeEntries(state.reviewEntries);
  state.reviewEntries = await getReviewEntries();
  const after = serializeEntries(state.reviewEntries);
  requestThumbnails(state.reviewEntries);
  return before !== after;
}

async function checkHealth(): Promise<void> {
  let shouldRender = false;

  try {
    await api("/health");
    if (state.currentView === "server") {
      state.currentView = "build";
      shouldRender = true;
    }

    const buildChanged = await refreshTasks();
    const reviewChanged = await refreshReviewEntries();
    if (buildChanged || reviewChanged) {
      shouldRender = true;
    }
  } catch (_error) {
    if (state.currentView !== "server") {
      shouldRender = true;
    }

    state.currentView = "server";
    state.modal = null;
    stopSelectionPolling();
  }

  if (shouldRender) {
    render();
  }
}

function startHealthPolling(): void {
  if (state.healthTimer) {
    clearInterval(state.healthTimer);
  }

  checkHealth();
  state.healthTimer = setInterval(checkHealth, HEALTH_INTERVAL);
}

function openModal(): void {
  state.modal = {
    mode: "create",
    step: "select",
    selected: null,
    name: "",
    comment: "",
    status: "to-build",
    thumbnail: null,
  };
  startSelectionPolling();
  render();
}

function openReviewEditModal(entry: TaskEntry): void {
  state.modal = {
    mode: "edit",
    step: "metadata",
    selected:
      entry.figmaNodeId && entry.figmaNodeName
        ? {
            nodeId: entry.figmaNodeId,
            nodeName: entry.figmaNodeName,
          }
        : {
            nodeId: "",
            nodeName: entry.figmaNodeName || "Unlinked",
          },
    linkingEntry: entry,
    name: entry.figmaNodeName || "",
    comment: entry.comment || "",
    status: entry.status,
    thumbnail: entry.figmaNodeId
      ? state.thumbnails[entry.figmaNodeId] || null
      : null,
  };

  stopSelectionPolling();
  render();
}

function openLinkModal(entry: TaskEntry): void {
  state.modal = {
    mode: "link",
    step: "select",
    selected: null,
    linkingEntry: entry,
    name: entry.figmaNodeName || "",
    comment: entry.comment || "",
    status: entry.status,
    thumbnail: null,
  };
  startSelectionPolling();
  render();
}

function openEditModal(entry: TaskEntry): void {
  if (!entry.figmaNodeId || !entry.figmaNodeName) {
    return;
  }

  state.modal = {
    mode: "edit",
    step: "metadata",
    selected: {
      nodeId: entry.figmaNodeId,
      nodeName: entry.figmaNodeName,
    },
    name: entry.figmaNodeName,
    comment: entry.comment || "",
    status: entry.status,
    thumbnail: state.thumbnails[entry.figmaNodeId] || null,
  };
  stopSelectionPolling();
  render();
}

function closeModal(): void {
  state.modal = null;
  stopSelectionPolling();
  render();
}

function getModalMetadataPayload(): {
  figmaNodeName: string;
  comment: string | undefined;
  status: TaskStatus;
  layerTree: string | undefined;
  componentsUsed: string[] | undefined;
} | null {
  if (!state.modal || !state.modal.selected) {
    return null;
  }

  const nameInput = document.getElementById(
    "modal-name",
  ) as HTMLInputElement | null;
  const commentInput = document.getElementById(
    "modal-comment",
  ) as HTMLTextAreaElement | null;

  const figmaNodeName = (
    nameInput
      ? nameInput.value
      : state.modal.name || state.modal.selected.nodeName
  ).trim();

  const comment = (
    commentInput ? commentInput.value : state.modal.comment || ""
  ).trim();

  return {
    figmaNodeName,
    comment: comment || undefined,
    status: readModalStatus(),
    layerTree: state.modal.layerTree ?? undefined,
    componentsUsed: state.modal.layerTreeComponents ?? undefined,
  };
}

async function queueModalEntry(): Promise<void> {
  if (!state.modal || !state.modal.selected) {
    return;
  }
  const payload = getModalMetadataPayload();
  if (!payload) return;

  if (state.modal.mode === "link") {
    if (!state.modal.linkingEntry?.dataCid) {
      return;
    }

    await linkReviewEntry(
      state.modal.linkingEntry.dataCid,
      state.modal.selected.nodeId,
      state.modal.selected.nodeName,
      payload.comment,
      payload.status,
      payload.layerTree,
      payload.componentsUsed,
    );
    postToSandbox({ type: "NOTIFY", message: "Review entry linked" });
  } else if (state.modal.mode === "edit") {
    if ((state.modal.linkingEntry?.type ?? "build") === "review") {
      if (!state.modal.linkingEntry?.dataCid) {
        return;
      }

      await updateReviewEntry(state.modal.linkingEntry.dataCid, {
        comment: payload.comment,
        status: payload.status,
      });
      postToSandbox({ type: "NOTIFY", message: "Review entry updated" });
    } else {
      await updateTask(state.modal.selected.nodeId, {
        figmaNodeName: payload.figmaNodeName || state.modal.selected.nodeName,
        comment: payload.comment,
        status: payload.status,
      });
      postToSandbox({ type: "NOTIFY", message: "Queue item updated" });
    }
  } else {
    await api("/tasks", {
      method: "POST",
      body: JSON.stringify({
        figmaNodeId: state.modal.selected.nodeId,
        figmaNodeName: payload.figmaNodeName || state.modal.selected.nodeName,
        comment: payload.comment,
        status: payload.status,
        layerTree: payload.layerTree,
        componentsUsed: payload.componentsUsed,
      }),
    });

    postToSandbox({ type: "NOTIFY", message: "Added to queue" });
  }

  closeModal();
  await refreshTasks();
  await refreshReviewEntries();
  render();
}

async function handleAction(
  action: string,
  entryId: string | null,
): Promise<void> {
  try {
    if (action === "switch-build") {
      state.currentView = "build";
      await refreshTasks();
      render();
      return;
    }

    if (action === "switch-review") {
      state.currentView = "review";
      await refreshReviewEntries();
      render();
      return;
    }

    if (action === "switch-settings") {
      state.currentView = "settings";
      render();
      return;
    }

    if (action === "settings-toggle-tree") {
      state.settings.generateLayerTree = !state.settings.generateLayerTree;
      saveSettings(state.settings);
      render();
      return;
    }

    if (action === "open-modal") {
      openModal();
      return;
    }

    if (action === "modal-cancel") {
      closeModal();
      return;
    }

    if (action === "modal-continue" && state.modal && state.modal.selected) {
      state.modal.step = "metadata";
      state.modal.name = state.modal.selected.nodeName;
      state.modal.layerTree = undefined;
      state.modal.layerTreeComponents = undefined;
      postToSandbox({
        type: "EXPORT_THUMBNAIL",
        nodeId: state.modal.selected.nodeId,
      });
      if (state.settings.generateLayerTree) {
        postToSandbox({
          type: "EXPORT_LAYER_TREE",
          nodeId: state.modal.selected.nodeId,
        });
      }
      render();
      return;
    }

    if (action === "modal-copy-cancel" && state.modal && state.modal.selected) {
      const nameInput = document.getElementById(
        "modal-name",
      ) as HTMLInputElement | null;
      const commentInput = document.getElementById(
        "modal-comment",
      ) as HTMLTextAreaElement | null;
      const name = (
        nameInput
          ? nameInput.value
          : state.modal.name || state.modal.selected.nodeName
      ).trim();
      const comment = (
        commentInput ? commentInput.value : state.modal.comment || ""
      ).trim();
      const status = readModalStatus();

      await copyText(
        formatEntryJson(
          state.modal.selected.nodeId,
          name || state.modal.selected.nodeName,
          comment,
          status,
        ),
      );

      closeModal();
      return;
    }

    if (action === "modal-queue") {
      await queueModalEntry();
      return;
    }

    if (action === "delete-entry" && entryId) {
      await deleteTask(entryId);
      await refreshTasks();
      render();
      return;
    }

    if (action === "edit-entry" && entryId) {
      const entry = state.entries.find((item) => item.figmaNodeId === entryId);
      if (entry) {
        openEditModal(entry);
      }
      return;
    }

    if (action === "link-review" && entryId) {
      const entry = state.reviewEntries.find(
        (item) => item.dataCid === entryId,
      );
      if (entry) {
        openLinkModal(entry);
      }
      return;
    }

    if (action === "edit-review" && entryId) {
      const entry = state.reviewEntries.find(
        (item) => item.dataCid === entryId,
      );
      if (entry) {
        openReviewEditModal(entry);
      }
      return;
    }

    if (action === "delete-review" && entryId) {
      await deleteReviewEntry(entryId);
      await refreshReviewEntries();
      render();
      return;
    }

    if (action === "copy-review" && entryId) {
      const entry = state.reviewEntries.find(
        (item) => item.dataCid === entryId,
      );
      if (entry) {
        await copyText(formatEntry(entry));
      }
      return;
    }

    if (action === "copy-entry" && entryId) {
      const entry = state.entries.find((item) => item.figmaNodeId === entryId);
      if (entry) {
        await copyText(formatEntry(entry));
      }
      return;
    }

    if (action === "copy-set") {
      const source =
        state.currentView === "review" ? state.reviewEntries : state.entries;
      const text = source.map(formatEntry).join("\n\n");
      await copyText(text);
      return;
    }

    if (action === "clear-all") {
      if (state.currentView === "review") {
        await clearReviewEntries();
        await refreshReviewEntries();
      } else {
        await clearTasks();
        await refreshTasks();
      }
      render();
    }
  } catch (_error) {
    const isServerAction = [
      "modal-queue",
      "delete-entry",
      "clear-all",
      "delete-review",
    ].includes(action);

    postToSandbox({
      type: "NOTIFY",
      message: isServerAction
        ? "Action failed. Check server connection."
        : "Action failed. Unable to complete this action.",
    });
  }
}

function onSelectionData(message: PluginToUiMessage): void {
  if (message.type !== "SELECTION_DATA") {
    return;
  }

  if (!state.modal || state.modal.step !== "select") {
    return;
  }

  const previousSelected = state.modal.selected;
  state.modal.selected = message.hasSelection
    ? {
        nodeId: message.nodeId,
        nodeName: message.nodeName,
      }
    : null;

  const changed =
    (previousSelected && !state.modal.selected) ||
    (!previousSelected && state.modal.selected) ||
    (previousSelected &&
      state.modal.selected &&
      (previousSelected.nodeId !== state.modal.selected.nodeId ||
        previousSelected.nodeName !== state.modal.selected.nodeName));

  if (changed) {
    render();
  }
}

function onThumbnailData(message: PluginToUiMessage): void {
  if (message.type !== "THUMBNAIL_DATA") {
    return;
  }

  if (state.thumbnails[message.nodeId] === message.base64) {
    return;
  }

  state.thumbnails[message.nodeId] = message.base64;

  if (
    state.modal &&
    state.modal.selected &&
    state.modal.selected.nodeId === message.nodeId
  ) {
    state.modal.thumbnail = message.base64;
  }

  render();
}

function onThumbnailError(message: PluginToUiMessage): void {
  if (message.type !== "THUMBNAIL_ERROR") {
    return;
  }

  if (state.thumbnails[message.nodeId] === null) {
    return;
  }

  state.thumbnails[message.nodeId] = null;
  render();
}

function onLayerTreeData(message: PluginToUiMessage): void {
  if (message.type !== "LAYER_TREE_DATA") return;
  if (!state.modal?.selected) return;
  if (state.modal.selected.nodeId !== message.nodeId) return;
  state.modal.layerTree = message.tree || null;
  state.modal.layerTreeComponents = message.componentsUsed;
  // No render needed — tree is included silently on queue submission.
}

function onLayerTreeError(message: PluginToUiMessage): void {
  if (message.type !== "LAYER_TREE_ERROR") return;
  if (!state.modal?.selected) return;
  if (state.modal.selected.nodeId !== message.nodeId) return;
  // Mark as null so we don't block submission on a failed tree.
  state.modal.layerTree = null;
  state.modal.layerTreeComponents = [];
}

function handlePluginMessage(message: PluginToUiMessage): void {
  if (message.type === "SELECTION_DATA") {
    onSelectionData(message);
    return;
  }

  if (message.type === "THUMBNAIL_DATA") {
    onThumbnailData(message);
    return;
  }

  if (message.type === "THUMBNAIL_ERROR") {
    onThumbnailError(message);
    return;
  }

  if (message.type === "LAYER_TREE_DATA") {
    onLayerTreeData(message);
    return;
  }

  if (message.type === "LAYER_TREE_ERROR") {
    onLayerTreeError(message);
  }
}

attachPluginBridge(handlePluginMessage);
render();
startHealthPolling();
