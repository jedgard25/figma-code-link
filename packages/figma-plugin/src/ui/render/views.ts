import type { TaskEntry } from "../../shared/messages";
import { API_BASE } from "../api/client";
import type { AppState } from "../state/store";

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function getTagClass(status: TaskEntry["status"]): string {
  if (status === "to-fix") return "tag--to-fix";
  if (status === "review") return "tag--review";
  if (status === "completed") return "tag--completed";
  return "tag--to-build";
}

export function renderServerView(): string {
  return `
    <div class="center-screen">
      <div><span class="pulse-dot pulse-dot--danger"></span>Waiting for server…</div>
      <div style="margin-top:8px;color:#aaaaaa">Start the figma-link server in your project.</div>
    </div>
  `;
}

export function renderNavbar(state: AppState): string {
  return `
    <div class="app-navbar">
      <div class="navbar__tabs">
        <button class="navbar__tab ${state.currentView === "build" ? "navbar__tab--active" : ""}" data-action="switch-build">Build</button>
        <button class="navbar__tab ${state.currentView === "review" ? "navbar__tab--active" : ""}" data-action="switch-review">Review</button>
      </div>
      <div class="navbar__actions">
        <button class="navbar__settings ${state.currentView === "settings" ? "navbar__settings--active" : ""}" data-action="switch-settings" title="Settings">⚙</button>
      </div>
    </div>
  `;
}

function renderQueue(state: AppState): string {
  if (!state.entries.length) {
    return `
      <div class="queue-empty">
        <div>No queued design tasks.</div>
        <div style="font-size:11px;margin-top:4px;color:#aaaaaa">Click 'Add to Queue' to get started.</div>
      </div>
    `;
  }

  return `<div class="queue">${state.entries
    .map((entry) => {
      const thumb = entry.figmaNodeId
        ? state.thumbnails[entry.figmaNodeId]
        : null;
      const thumbMarkup = thumb
        ? `<img src="data:image/png;base64,${thumb}" alt="${escHtml(entry.figmaNodeName)}" />`
        : "<span>—</span>";
      const entryId = entry.figmaNodeId || "";

      return `
        <div class="queue-item">
          <div class="queue-item__thumbnail">${thumbMarkup}</div>
          <div class="queue-item__details">
            <div class="queue-item__name">${escHtml(entry.figmaNodeName)}</div>
            ${entry.comment ? `<div class="queue-item__comment">${escHtml(entry.comment)}</div>` : ""}
            <div class="queue-item__actions">
              <span class="queue-item__tag ${getTagClass(entry.status)}">${escHtml(entry.status)}</span>
              <button class="queue-item__btn queue-item__btn--edit" data-action="edit-entry" data-entry-id="${entryId}">Edit</button>
              <button class="queue-item__btn queue-item__btn--delete" data-action="delete-entry" data-entry-id="${entryId}">Delete</button>
              <button class="queue-item__btn queue-item__btn--copy" data-action="copy-entry" data-entry-id="${entryId}">Copy</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("")}</div>`;
}

export function renderBuildView(state: AppState): string {
  return `
    ${renderNavbar(state)}
    <div class="content-area">${renderQueue(state)}</div>
    <div class="toolbar">
      <button class="btn btn-primary" data-action="open-modal">Add to Queue</button>
      <button class="btn btn-secondary" data-action="copy-set" ${state.entries.length === 0 ? "disabled" : ""}>Copy Set</button>
      <button class="btn btn-secondary" data-action="clear-all" ${state.entries.length === 0 ? "disabled" : ""}>Clear All</button>
    </div>
  `;
}

function getScreenshotUrl(domThumbnailPath?: string): string | null {
  if (!domThumbnailPath) {
    return null;
  }

  const filename = domThumbnailPath.split("/").filter(Boolean).pop();
  if (!filename) {
    return null;
  }

  return `${API_BASE}/review/screenshot/${encodeURIComponent(filename)}`;
}

function renderReviewList(state: AppState): string {
  if (!state.reviewEntries.length) {
    return `
      <div class="queue-empty">
        <div>No review entries yet.</div>
        <div style="font-size:11px;margin-top:4px;color:#aaaaaa">Use the DOM review overlay in your app to add one.</div>
      </div>
    `;
  }

  return `<div class="queue">${state.reviewEntries
    .map((entry) => {
      const linked = Boolean(entry.figmaNodeId && entry.figmaNodeName);
      const figThumb = entry.figmaNodeId
        ? state.thumbnails[entry.figmaNodeId]
        : null;
      const domScreenshot = getScreenshotUrl(entry.domThumbnailPath);
      const statusTag = `<span class="queue-item__tag ${getTagClass(entry.status)}">${escHtml(entry.status)}</span>`;
      const cidMarkup = entry.dataCid
        ? `<div class="review-card__cid">CID: ${escHtml(entry.dataCid)}</div>`
        : "";

      return `
        <div class="review-card ${linked ? "" : "review-card--unlinked"}">
          <div class="review-card__media">
            <div class="queue-item__thumbnail review-card__figma-thumb">
              ${linked && figThumb ? `<img src="data:image/png;base64,${figThumb}" alt="${escHtml(entry.figmaNodeName)}" />` : `<span class="review-card__broken-link">⛓️‍💥</span>`}
            </div>
            <div class="queue-item__thumbnail review-card__dom-thumb">
              ${domScreenshot ? `<img src="${escHtml(domScreenshot)}" alt="${escHtml(entry.dataCid || "DOM")}" />` : "<span>DOM</span>"}
            </div>
          </div>
          <div class="queue-item__details">
            <div class="queue-item__name">${escHtml(entry.figmaNodeName || "Unlinked")}</div>
            ${cidMarkup}
            ${entry.comment ? `<div class="queue-item__comment">${escHtml(entry.comment)}</div>` : ""}
            <div class="queue-item__actions">
              ${statusTag}
              ${linked ? `<button class="queue-item__btn queue-item__btn--edit" data-action="edit-review" data-entry-id="${escHtml(entry.dataCid || "")}">Edit</button>` : `<button class="queue-item__btn queue-item__btn--edit" data-action="link-review" data-entry-id="${escHtml(entry.dataCid || "")}">Link</button>`}
              <button class="queue-item__btn queue-item__btn--delete" data-action="delete-review" data-entry-id="${escHtml(entry.dataCid || "")}">Delete</button>
              <button class="queue-item__btn queue-item__btn--copy" data-action="copy-review" data-entry-id="${escHtml(entry.dataCid || "")}">Copy</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("")}</div>`;
}

export function renderReviewView(state: AppState): string {
  return `
    ${renderNavbar(state)}
    <div class="content-area">${renderReviewList(state)}</div>
    <div class="toolbar">
      <button class="btn btn-secondary" data-action="copy-set" ${state.reviewEntries.length === 0 ? "disabled" : ""}>Copy Set</button>
      <button class="btn btn-secondary" data-action="clear-all" ${state.reviewEntries.length === 0 ? "disabled" : ""}>Clear All</button>
    </div>
  `;
}

export function escapeHtml(value: unknown): string {
  return escHtml(value);
}
