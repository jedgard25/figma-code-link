import type { AppState } from "../state/store";
import { API_BASE } from "../api/client";
import { escapeHtml } from "./views";

const STATUS_OPTIONS = ["to-build", "to-fix", "review", "completed"];

export function renderModal(state: AppState): string {
  if (!state.modal) return "";

  const modal = state.modal;

  if (modal.step === "select") {
    const selected = modal.selected;
    const isLink = modal.mode === "link";
    const title = isLink
      ? "Select the Figma layer for this entry"
      : "Select New Component";
    const subtitle = isLink
      ? "Select a Figma node to link to this DOM review entry."
      : "Select a component on the canvas to create a ticket.";
    const context =
      isLink && modal.linkingEntry
        ? `<div class="selection-card"><div class="selection-card__name">${escapeHtml(modal.linkingEntry.dataCid || "")}</div><div class="selection-card__id">${escapeHtml(modal.linkingEntry.comment || "No comment")}</div></div>`
        : "";

    return `
      <div class="modal-backdrop"></div>
      <div class="modal">
        <div class="modal__header">
          <div class="modal__title">${title}</div>
          <div class="modal__subtitle">${subtitle}</div>
        </div>
        <div class="modal__body">
          ${context}
          <div class="modal__center">
            ${selected ? "" : '<div><span class="pulse-dot" style="background:#888888"></span>Waiting for selection…</div>'}
            ${
              selected
                ? `<div class="selection-card"><div class="selection-card__name">Selected: ${escapeHtml(selected.nodeName)}</div><div class="selection-card__id">${escapeHtml(selected.nodeId)}</div></div>`
                : ""
            }
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn-secondary" data-action="modal-cancel">Cancel</button>
          <button class="btn btn-primary" data-action="modal-continue" ${selected ? "" : "disabled"}>Continue</button>
        </div>
      </div>
    `;
  }

  const selected = state.modal.selected;
  if (!selected) {
    return "";
  }

  const thumb = modal.thumbnail || state.thumbnails[selected.nodeId] || null;
  const isEdit = modal.mode === "edit";
  const isLink = modal.mode === "link";
  const actionLabel = isLink ? "Link" : isEdit ? "Save" : "Queue";
  const subtitle = isLink
    ? "Review and confirm metadata before linking this entry."
    : isEdit
      ? "Edit metadata for this queued item."
      : "Add metadata before creating the queue item.";
  const linkedDomShot =
    isLink && modal.linkingEntry?.domThumbnailPath
      ? `${API_BASE}/review/screenshot/${encodeURIComponent(
          modal.linkingEntry.domThumbnailPath
            .split("/")
            .filter(Boolean)
            .pop() || "",
        )}`
      : null;

  return `
    <div class="modal-backdrop"></div>
    <div class="modal">
      <div class="modal__header">
        <div class="modal__title">Queue Details</div>
        <div class="modal__subtitle">${subtitle}</div>
      </div>
      <div class="modal__body">
        <div class="preview-row">
          <div class="queue-item__thumbnail">${thumb ? `<img src="data:image/png;base64,${thumb}" alt="thumb" />` : "<span>—</span>"}</div>
          ${
            isLink
              ? `<div class="queue-item__thumbnail">${linkedDomShot ? `<img src="${escapeHtml(linkedDomShot)}" alt="dom thumb" />` : "<span>DOM</span>"}</div>`
              : ""
          }
          <div class="preview-details">
            <div class="preview-details__name">${escapeHtml(selected.nodeName)}</div>
            <div class="preview-details__id">${escapeHtml(selected.nodeId)}</div>
            ${
              isLink && modal.linkingEntry?.dataCid
                ? `<div class="preview-details__id">CID: ${escapeHtml(modal.linkingEntry.dataCid)}</div>`
                : ""
            }
          </div>
        </div>
        ${
          isLink
            ? ""
            : `<div class="field"><label for="modal-name">Name</label><input id="modal-name" type="text" value="${escapeHtml(modal.name)}" placeholder="Layer name" /></div>`
        }
        <div class="field">
          <label for="modal-comment">Comments</label>
          <textarea id="modal-comment" rows="3" placeholder="Describe what needs to be built or fixed…">${escapeHtml(modal.comment || "")}</textarea>
        </div>
        <div class="field">
          <label for="modal-status">Status</label>
          <select id="modal-status">
            ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${modal.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="modal__footer">
        <button class="btn btn-secondary" data-action="modal-cancel">Cancel</button>
        ${isLink ? "" : `<button class="btn btn-secondary" data-action="modal-copy-cancel">Copy & ${isEdit ? "Close" : "Cancel"}</button>`}
        <button class="btn btn-primary" data-action="modal-queue">${actionLabel}</button>
      </div>
    </div>
  `;
}
