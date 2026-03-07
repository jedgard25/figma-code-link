<script lang="ts">
  import type { TaskEntry, TaskStatus } from "../types.js";
  import { onDestroy, onMount } from "svelte";

  type SavedEntry = {
    cid: string;
    comment?: string;
    status: TaskStatus;
    figmaNodeId?: string;
    figmaNodeName?: string;
  };

  type PersistentRect = {
    cid: string;
    entry: SavedEntry;
    rect: DOMRect;
  };

  const DEFAULT_URL = "http://localhost:7842";
  const STORAGE_KEY = "fcl:review-overlay";
  const IS_DEV = import.meta.env.DEV;
  const C = {
    bg: "#171717",
    panel: "#202020",
    border: "#3b3b3b",
    accent: "#ff6b35",
    accentSoft: "rgba(255, 107, 53, 0.14)",
    success: "#53d769",
    successSoft: "rgba(83, 215, 105, 0.12)",
    error: "#ff5f57",
    text: "#f2f2f2",
    muted: "#b7b7b7",
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    sans: "'IBM Plex Sans', 'Avenir Next', 'Segoe UI', sans-serif",
  } as const;

  export let serverUrl = DEFAULT_URL;
  export let enabledByDefault = false;

  let rootEl: HTMLDivElement | null = null;
  let enabled = false;
  let connected = false;
  let hoverEl: HTMLElement | null = null;
  let hoverRect: DOMRect | null = null;
  let selectedEl: HTMLElement | null = null;
  let selectedRect: DOMRect | null = null;
  let selectedCid: string | null = null;
  let comment = "";
  let status: TaskStatus = "to-fix";
  let saveError: string | null = null;
  let isSaving = false;
  let isDeleting = false;
  let isEditing = false;
  let healthInterval: number | null = null;
  let listenersAttached = false;
  let pointer = { x: 0, y: 0, hasValue: false };
  let persistentRects: PersistentRect[] = [];
  let savedEntries: SavedEntry[] = [];
  let hoverCid: string | null = null;
  let hoverSaved = false;
  let popupTop = 24;
  let popupLeft = 24;

  function isBrowser(): boolean {
    return typeof window !== "undefined";
  }

  function readStoredEnabled(): boolean {
    if (!isBrowser()) {
      return false;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? enabledByDefault : stored === "1";
  }

  function writeStoredEnabled(value: boolean): void {
    if (!isBrowser()) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  }

  function getClosestCidTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }

    if (rootEl && rootEl.contains(target)) {
      return null;
    }

    const match = target.closest("[data-cid]");
    return match instanceof HTMLElement ? match : null;
  }

  function escapeCid(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }

    return value.replace(/([\"\\])/g, "\\$1");
  }

  function getEntry(cid: string | null): SavedEntry | undefined {
    return cid ? savedEntries.find((entry) => entry.cid === cid) : undefined;
  }

  function refreshPersistentRects(): void {
    if (!isBrowser() || !enabled) {
      persistentRects = [];
      return;
    }

    const nextRects: PersistentRect[] = [];
    for (const entry of savedEntries) {
      const element = document.querySelector<HTMLElement>(
        `[data-cid="${escapeCid(entry.cid)}"]`,
      );
      if (!element) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }

      nextRects.push({ cid: entry.cid, entry, rect });
    }

    persistentRects = nextRects;
  }

  function refreshGeometry(): void {
    if (!enabled || !isBrowser()) {
      return;
    }

    if (pointer.hasValue) {
      const nextHover = getClosestCidTarget(document.elementFromPoint(pointer.x, pointer.y));
      const nextCid = nextHover?.dataset.cid?.trim();
      if (nextHover && nextCid) {
        hoverEl = nextHover;
        hoverRect = nextHover.getBoundingClientRect();
      } else {
        hoverEl = null;
        hoverRect = null;
      }
    }

    if (selectedEl) {
      selectedRect = selectedEl.getBoundingClientRect();
    }

    refreshPersistentRects();
  }

  async function fetchExistingReviews(): Promise<void> {
    try {
      const response = await fetch(`${serverUrl}/review`, { cache: "no-store" });
      if (!response.ok) {
        savedEntries = [];
        refreshPersistentRects();
        return;
      }

      const payload = (await response.json()) as TaskEntry[];
      savedEntries = Array.isArray(payload)
        ? payload
            .filter((entry): entry is TaskEntry & { dataCid: string } => Boolean(entry.dataCid))
            .map((entry) => ({
              cid: entry.dataCid,
              comment: entry.comment,
              status: entry.status,
              figmaNodeId: entry.figmaNodeId,
              figmaNodeName: entry.figmaNodeName,
            }))
        : [];
      refreshPersistentRects();
    } catch {
      savedEntries = [];
      refreshPersistentRects();
    }
  }

  async function checkHealth(): Promise<void> {
    try {
      const response = await fetch(`${serverUrl}/health`, { cache: "no-store" });
      const payload = (await response.json()) as { ok?: boolean };
      connected = response.ok && payload.ok === true;
    } catch {
      connected = false;
    }
  }

  async function captureElement(element: HTMLElement): Promise<string | null> {
    try {
      const mod = await import("html2canvas");
      const html2canvas = typeof mod === "function" ? mod : mod.default;
      if (typeof html2canvas !== "function") {
        return null;
      }

      const canvas = await html2canvas(element, {
        backgroundColor: null,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
      });

      return canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("[figma-code-link] html2canvas capture failed:", error);
      return null;
    }
  }

  async function postJson(route: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${serverUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`${route} -> HTTP ${response.status}`);
    }

    return response.json();
  }

  async function deleteSelectedReview(): Promise<void> {
    if (!selectedCid || isDeleting) {
      return;
    }

    isDeleting = true;
    saveError = null;

    try {
      const response = await fetch(`${serverUrl}/review/${encodeURIComponent(selectedCid)}`, {
        method: "DELETE",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`DELETE /review/${selectedCid} -> HTTP ${response.status}`);
      }

      savedEntries = savedEntries.filter((entry) => entry.cid !== selectedCid);
      clearSelection();
      refreshPersistentRects();
    } catch {
      saveError = "Unable to delete review. Check server connection.";
    } finally {
      isDeleting = false;
    }
  }

  async function saveReview(): Promise<void> {
    if (!selectedEl || !selectedCid || isSaving) {
      return;
    }

    isSaving = true;
    saveError = null;

    try {
      await postJson("/review", {
        dataCid: selectedCid,
        comment: comment.trim() || undefined,
        status,
      });

      const screenshot = await captureElement(selectedEl);
      if (screenshot) {
        try {
          await postJson("/review/screenshot", {
            dataCid: selectedCid,
            base64: screenshot,
          });
        } catch (error) {
          console.warn("[figma-code-link] screenshot upload failed:", error);
        }
      }

      const existing = getEntry(selectedCid);
      const nextEntry: SavedEntry = {
        cid: selectedCid,
        comment: comment.trim() || undefined,
        status,
        figmaNodeId: existing?.figmaNodeId,
        figmaNodeName: existing?.figmaNodeName,
      };

      savedEntries = [
        nextEntry,
        ...savedEntries.filter((entry) => entry.cid !== selectedCid),
      ];
      clearSelection();
      refreshPersistentRects();
    } catch {
      saveError = "Unable to save review. Check server connection.";
    } finally {
      isSaving = false;
    }
  }

  function clearSelection(): void {
    selectedEl = null;
    selectedRect = null;
    selectedCid = null;
    comment = "";
    status = "to-fix";
    saveError = null;
    isEditing = false;
  }

  function openSelection(element: HTMLElement): void {
    const cid = element.dataset.cid?.trim();
    if (!cid) {
      return;
    }

    selectedEl = element;
    selectedRect = element.getBoundingClientRect();
    selectedCid = cid;
    hoverEl = null;
    hoverRect = null;

    const existing = getEntry(cid);
    comment = existing?.comment ?? "";
    status = existing?.status ?? "to-fix";
    isEditing = !existing;
    saveError = null;
  }

  function onPointerMove(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY, hasValue: true };
    const nextHover = getClosestCidTarget(event.target);
    const nextCid = nextHover?.dataset.cid?.trim();
    if (!nextHover || !nextCid) {
      hoverEl = null;
      hoverRect = null;
      return;
    }

    hoverEl = nextHover;
    hoverRect = nextHover.getBoundingClientRect();
  }

  function onClick(event: MouseEvent): void {
    if (rootEl && event.target instanceof Node && rootEl.contains(event.target)) {
      return;
    }

    const target = getClosestCidTarget(event.target);
    const cid = target?.dataset.cid?.trim();
    if (!target || !cid) {
      clearSelection();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openSelection(target);
  }

  function handleToggle(): void {
    enabled = !enabled;
    writeStoredEnabled(enabled);

    if (!enabled) {
      hoverEl = null;
      hoverRect = null;
      persistentRects = [];
      clearSelection();
    } else {
      void fetchExistingReviews();
      refreshGeometry();
    }
  }

  function attachListeners(): void {
    if (listenersAttached) {
      return;
    }

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", refreshGeometry, { capture: true, passive: true });
    window.addEventListener("resize", refreshGeometry, { passive: true });
    listenersAttached = true;
  }

  function detachListeners(): void {
    if (!listenersAttached) {
      return;
    }

    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("scroll", refreshGeometry, true);
    window.removeEventListener("resize", refreshGeometry);
    listenersAttached = false;
  }

  $: if (!enabled) {
    detachListeners();
  }

  $: if (enabled && isBrowser() && IS_DEV) {
    attachListeners();
  }

  onMount(() => {
    if (!IS_DEV || !isBrowser()) {
      return;
    }

    enabled = readStoredEnabled();
    void checkHealth();
    healthInterval = window.setInterval(() => {
      void checkHealth();
    }, 5000);

    if (enabled) {
      void fetchExistingReviews();
      attachListeners();
    }

    return () => {
      detachListeners();
      if (healthInterval) {
        window.clearInterval(healthInterval);
      }
    };
  });

  onDestroy(() => {
    detachListeners();
    if (healthInterval) {
      window.clearInterval(healthInterval);
    }
  });

  $: hoverCid = hoverEl?.dataset.cid?.trim() ?? null;
  $: hoverSaved = Boolean(getEntry(hoverCid));
  $: popupTop = isBrowser() && selectedRect
    ? Math.min(window.innerHeight - 320, Math.max(12, selectedRect.bottom + 10))
    : 24;
  $: popupLeft = isBrowser() && selectedRect
    ? Math.min(window.innerWidth - 332, Math.max(12, selectedRect.left))
    : 24;
</script>

{#if IS_DEV}
  <div bind:this={rootEl} class="fcl-root">
    <div class="fcl-toolbar">
      <div class:connected class="fcl-status">FCL</div>
      <button
        type="button"
        class:active={enabled}
        class="fcl-toggle"
        on:click={handleToggle}
        aria-label="Toggle Figma review overlay"
        title={enabled ? "Disable review overlay" : "Enable review overlay"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
    </div>

    {#if enabled && hoverRect && !selectedRect}
      <div
        class:linked={hoverSaved}
        class="fcl-outline fcl-outline-hover"
        style:left={`${hoverRect.left}px`}
        style:top={`${hoverRect.top}px`}
        style:width={`${Math.max(0, hoverRect.width)}px`}
        style:height={`${Math.max(0, hoverRect.height)}px`}
      >
        <div class="fcl-chip">{hoverCid}</div>
      </div>
    {/if}

    {#if enabled}
      {#each persistentRects as item (item.cid)}
        {#if item.cid !== selectedCid}
          <div
            class="fcl-outline fcl-outline-saved"
            style:left={`${item.rect.left}px`}
            style:top={`${item.rect.top}px`}
            style:width={`${Math.max(0, item.rect.width)}px`}
            style:height={`${Math.max(0, item.rect.height)}px`}
          >
            <div class="fcl-chip saved">{item.cid}</div>
          </div>
          <button
            type="button"
            class="fcl-pin"
            style:left={`${Math.min(window.innerWidth - 46, Math.max(8, item.rect.right - 42))}px`}
            style:top={`${Math.min(window.innerHeight - 46, Math.max(8, item.rect.top + 8))}px`}
            on:click={() => {
              const element = document.querySelector<HTMLElement>(`[data-cid="${escapeCid(item.cid)}"]`);
              if (element) {
                openSelection(element);
              }
            }}
            title={item.entry.comment ?? item.cid}
          >
            <span>{item.entry.comment ? item.entry.comment.slice(0, 1).toUpperCase() : "•"}</span>
          </button>
        {/if}
      {/each}
    {/if}

    {#if enabled && selectedRect && selectedCid}
      <div
        class="fcl-outline fcl-outline-active"
        style:left={`${selectedRect.left}px`}
        style:top={`${selectedRect.top}px`}
        style:width={`${Math.max(0, selectedRect.width)}px`}
        style:height={`${Math.max(0, selectedRect.height)}px`}
      >
        <div class="fcl-chip active">{selectedCid}</div>
      </div>

      <div class="fcl-popup" style:left={`${popupLeft}px`} style:top={`${popupTop}px`}>
        <div class="fcl-popup-header">
          <div>
            <div class="fcl-popup-label">Selected element</div>
            <div class="fcl-popup-cid">{selectedCid}</div>
          </div>
          <button type="button" class="ghost" on:click={clearSelection}>Close</button>
        </div>

        {#if !isEditing && getEntry(selectedCid)}
          <div class="fcl-meta-row">
            <span class="status-pill">{getEntry(selectedCid)?.status}</span>
            {#if getEntry(selectedCid)?.figmaNodeName}
              <span class="link-pill">{getEntry(selectedCid)?.figmaNodeName}</span>
            {/if}
          </div>
          {#if getEntry(selectedCid)?.comment}
            <p class="fcl-comment">{getEntry(selectedCid)?.comment}</p>
          {:else}
            <p class="fcl-comment muted">No comment saved for this review.</p>
          {/if}
          <div class="fcl-actions">
            <button type="button" class="ghost" on:click={() => (isEditing = true)}>Edit</button>
            <button type="button" class="danger" on:click={() => void deleteSelectedReview()} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        {:else}
          <label class="fcl-field">
            <span>Status</span>
            <select bind:value={status}>
              <option value="to-fix">to-fix</option>
              <option value="review">review</option>
              <option value="completed">completed</option>
            </select>
          </label>

          <label class="fcl-field">
            <span>Comment</span>
            <textarea bind:value={comment} rows="4" placeholder="Add a review note"></textarea>
          </label>

          {#if saveError}
            <div class="fcl-error">{saveError}</div>
          {/if}

          <div class="fcl-actions">
            {#if getEntry(selectedCid)}
              <button type="button" class="ghost" on:click={() => (isEditing = false)}>Cancel</button>
            {/if}
            <button type="button" class="primary" on:click={() => void saveReview()} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save review"}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .fcl-root {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    pointer-events: none;
    font-family: var(--fcl-font-sans, 'IBM Plex Sans', 'Avenir Next', 'Segoe UI', sans-serif);
  }

  .fcl-toolbar {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
  }

  .fcl-status,
  .fcl-toggle {
    height: 36px;
    border-radius: 10px;
    border: 1px solid #3b3b3b;
    background: #171717;
    color: #f2f2f2;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
  }

  .fcl-status {
    min-width: 48px;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #ff5f57;
  }

  .fcl-status.connected {
    color: #53d769;
  }

  .fcl-toggle {
    width: 36px;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
  }

  .fcl-toggle.active {
    background: #ff6b35;
    border-color: #ff8b61;
  }

  .fcl-toggle:hover {
    transform: translateY(-1px);
  }

  .fcl-toggle svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .fcl-outline {
    position: fixed;
    border-radius: 4px;
    box-sizing: border-box;
    pointer-events: none;
  }

  .fcl-outline-hover {
    border: 1.5px dashed #ff6b35;
    background: rgba(255, 107, 53, 0.14);
  }

  .fcl-outline-hover.linked {
    border-style: solid;
    border-color: #53d769;
    background: rgba(83, 215, 105, 0.12);
  }

  .fcl-outline-saved {
    border: 1.5px solid #53d769;
    background: rgba(83, 215, 105, 0.08);
  }

  .fcl-outline-active {
    border: 1.5px dashed #ff6b35;
    background: rgba(255, 107, 53, 0.14);
  }

  .fcl-chip {
    position: absolute;
    top: -1px;
    left: -1px;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 3px 8px;
    border-radius: 4px 0 4px 0;
    background: #ff6b35;
    color: white;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 9px;
    letter-spacing: 0.04em;
  }

  .fcl-chip.saved {
    background: #53d769;
    color: #0b1b0f;
  }

  .fcl-pin {
    position: fixed;
    width: 38px;
    height: 38px;
    border: 1px solid rgba(83, 215, 105, 0.45);
    border-radius: 999px;
    background: rgba(16, 52, 27, 0.96);
    color: #c8ffd3;
    pointer-events: auto;
    cursor: pointer;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  }

  .fcl-pin span {
    font-size: 13px;
    font-weight: 700;
  }

  .fcl-popup {
    position: fixed;
    width: 320px;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid #3b3b3b;
    background: rgba(23, 23, 23, 0.97);
    color: #f2f2f2;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }

  .fcl-popup-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .fcl-popup-label {
    color: #b7b7b7;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 4px;
  }

  .fcl-popup-cid {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
  }

  .fcl-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }

  .status-pill,
  .link-pill {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 11px;
  }

  .status-pill {
    background: rgba(255, 107, 53, 0.14);
    color: #ffd8ca;
  }

  .link-pill {
    background: rgba(83, 215, 105, 0.12);
    color: #c8ffd3;
  }

  .fcl-comment {
    margin: 0 0 12px;
    line-height: 1.5;
    font-size: 13px;
  }

  .fcl-comment.muted {
    color: #b7b7b7;
  }

  .fcl-field {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
  }

  .fcl-field span {
    color: #b7b7b7;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .fcl-field select,
  .fcl-field textarea {
    width: 100%;
    border: 1px solid #3b3b3b;
    border-radius: 10px;
    background: #202020;
    color: #f2f2f2;
    padding: 10px 12px;
    font: inherit;
  }

  .fcl-field textarea {
    resize: vertical;
    min-height: 92px;
  }

  .fcl-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .fcl-actions button,
  .ghost,
  .primary,
  .danger {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid transparent;
    cursor: pointer;
    font: inherit;
  }

  .ghost {
    background: transparent;
    border-color: #3b3b3b;
    color: #f2f2f2;
  }

  .primary {
    background: #ff6b35;
    color: white;
  }

  .danger {
    background: rgba(255, 95, 87, 0.12);
    color: #ffc7c3;
    border-color: rgba(255, 95, 87, 0.3);
  }

  .fcl-error {
    margin-bottom: 10px;
    color: #ffc7c3;
    font-size: 12px;
  }
</style>