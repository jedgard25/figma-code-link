"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TaskEntry, TaskStatus } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DomReviewOverlayProps {
  serverUrl?: string;
}

interface SavedEntry {
  cid: string;
  comment?: string;
  status: TaskStatus;
  figmaNodeId?: string;
  figmaNodeName?: string;
}

type Html2CanvasFn = (
  element: HTMLElement,
  options?: Record<string, unknown>,
) => Promise<HTMLCanvasElement>;

// ─── Constants & Design Tokens ────────────────────────────────────────────────

const DEFAULT_URL = "http://localhost:7842";
const STORAGE_KEY = "fcl:review-overlay";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO =
  "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace";

const C = {
  bg: "#1E1E1E",
  bgSecondary: "#282828",
  bgHover: "#353535",
  border: "#3A3A3A",
  accent: "#7B61FF",
  text: "#E8E8E8",
  textMuted: "#999999",
  textDim: "#555555",
  error: "#FF6B6B",
  success: "#4ADE80",
  warning: "#FBBF24",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readStoredEnabled(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function writeStoredEnabled(enabled: boolean): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

/** Walks up from `start` looking for the nearest [data-cid] element.
 *  Returns null if the element is part of the overlay itself. */
function findCidTarget(
  start: EventTarget | null,
  overlayRoot: HTMLElement | null,
): HTMLElement | null {
  if (!(start instanceof Element)) return null;
  // Block self-inspection — never highlight overlay UI
  if (overlayRoot && overlayRoot.contains(start)) return null;
  const el = start.closest("[data-cid]");
  return el instanceof HTMLElement ? el : null;
}

/** Best-effort html2canvas capture. Returns base64 data URL or null. */
async function captureElement(el: HTMLElement): Promise<string | null> {
  try {
    const mod = await import("html2canvas");
    let h2c: Html2CanvasFn | null = null;
    if (typeof mod === "function") {
      h2c = mod as Html2CanvasFn;
    } else if (
      typeof mod === "object" &&
      mod !== null &&
      "default" in mod &&
      typeof (mod as { default: unknown }).default === "function"
    ) {
      h2c = (mod as { default: Html2CanvasFn }).default;
    }
    if (!h2c) return null;
    const canvas = await h2c(el, {
      backgroundColor: null,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[figma-code-link] html2canvas capture failed:", err);
    return null;
  }
}

async function postJson(
  serverUrl: string,
  route: string,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(`${serverUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${route} → HTTP ${res.status}`);
  return res.json();
}

async function deleteReview(serverUrl: string, dataCid: string): Promise<void> {
  const res = await fetch(
    `${serverUrl}/review/${encodeURIComponent(dataCid)}`,
    {
      method: "DELETE",
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`/review/${dataCid} → HTTP ${res.status}`);
}

async function fetchExistingReviews(serverUrl: string): Promise<TaskEntry[]> {
  try {
    const res = await fetch(`${serverUrl}/review`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    // GET /review returns a plain TaskEntry[] array
    return Array.isArray(data) ? (data as TaskEntry[]) : [];
  } catch {
    return [];
  }
}

function computePopupPosition(
  rect: DOMRect,
  popupHeight = 260,
): { top: number; left: number } {
  const width = 300;
  const margin = 12;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const top =
    spaceBelow >= popupHeight
      ? rect.bottom + 8
      : Math.max(margin, rect.top - popupHeight - 8);
  const left = Math.min(
    Math.max(margin, rect.left),
    window.innerWidth - width - margin,
  );
  return { top, left };
}

// ─── Lucide-style pencil SVG ─────────────────────────────────────────────────

function PencilIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DomReviewOverlay({
  serverUrl = DEFAULT_URL,
}: DomReviewOverlayProps) {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);

  // Hover
  const [hoverEl, setHoverEl] = useState<HTMLElement | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverElRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  // Selected element + its live scrolled rect (for both outline and popup)
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [liveRect, setLiveRect] = useState<DOMRect | null>(null);

  // Persistent outlines: ref holds DOM elements, state holds their live rects
  const persistentElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [persistentRects, setPersistentRects] = useState<Map<string, DOMRect>>(
    new Map(),
  );

  // Form state
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<TaskStatus>("to-fix");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Server-seeded review cache
  const [savedEntries, setSavedEntries] = useState<Map<string, SavedEntry>>(
    new Map(),
  );
  // view mode — show an existing entry in the popup
  const [viewingEntry, setViewingEntry] = useState<SavedEntry | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);

  // ── Init ──
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    setEnabled(readStoredEnabled());
  }, []);

  // ── Server health poll ──
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let active = true;
    const check = async () => {
      try {
        const res = await fetch(`${serverUrl}/health`, { cache: "no-store" });
        const payload = (await res.json()) as { ok?: boolean };
        if (active) setConnected(res.ok && payload.ok === true);
      } catch {
        if (active) setConnected(false);
      }
    };
    void check();
    const interval = window.setInterval(check, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [serverUrl]);

  // ── Toggle ──
  useEffect(() => {
    writeStoredEnabled(enabled);
    if (!enabled) {
      setHoverEl(null);
      setHoverRect(null);
      hoverElRef.current = null;
      pointerRef.current = null;
      setSelectedEl(null);
      setLiveRect(null);
      setViewingEntry(null);
      setComment("");
      setStatus("to-fix");
      setSaveError(null);
      persistentElsRef.current.clear();
      setPersistentRects(new Map());
    }
  }, [enabled]);

  // ── Seed cache from server ──
  useEffect(() => {
    if (!enabled) return;
    void fetchExistingReviews(serverUrl).then((entries) => {
      const map = new Map<string, SavedEntry>();
      for (const e of entries) {
        if (e.dataCid) {
          map.set(e.dataCid, {
            cid: e.dataCid,
            comment: e.comment,
            status: e.status,
            figmaNodeId: e.figmaNodeId,
            figmaNodeName: e.figmaNodeName,
          });
        }
      }
      setSavedEntries(map);
    });
  }, [enabled, serverUrl]);

  // ── Build persistentEls map whenever savedEntries changes ──
  useEffect(() => {
    if (!enabled) return;
    const map = new Map<string, HTMLElement>();
    for (const cid of savedEntries.keys()) {
      try {
        const escaped = CSS.escape(cid);
        const el = document.querySelector<HTMLElement>(
          `[data-cid="${escaped}"]`,
        );
        if (el) map.set(cid, el);
      } catch {
        // CSS.escape not available in some old envs — skip
      }
    }
    persistentElsRef.current = map;

    // Read initial rects
    const rects = new Map<string, DOMRect>();
    for (const [cid, el] of map) {
      rects.set(cid, el.getBoundingClientRect());
    }
    setPersistentRects(rects);
  }, [enabled, savedEntries]);

  // ── Unified scroll / resize handler ──
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      // Update hover target + rect based on last known pointer position.
      const pointer = pointerRef.current;
      if (pointer) {
        const hovered = findCidTarget(
          document.elementFromPoint(pointer.x, pointer.y),
          rootRef.current,
        );
        const cid = hovered?.getAttribute("data-cid")?.trim();
        if (hovered && cid) {
          hoverElRef.current = hovered;
          setHoverEl(hovered);
          setHoverRect(hovered.getBoundingClientRect());
        } else {
          hoverElRef.current = null;
          setHoverEl(null);
          setHoverRect(null);
        }
      } else if (hoverElRef.current) {
        setHoverRect(hoverElRef.current.getBoundingClientRect());
      }

      // Update selectedEl rect
      if (selectedEl) {
        setLiveRect(selectedEl.getBoundingClientRect());
      }
      // Update all persistent rects
      const rects = new Map<string, DOMRect>();
      for (const [cid, el] of persistentElsRef.current) {
        rects.set(cid, el.getBoundingClientRect());
      }
      setPersistentRects(rects);
    };

    // Initial read for selectedEl
    if (selectedEl) setLiveRect(selectedEl.getBoundingClientRect());

    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [enabled, selectedEl]);

  // ── Event listeners ──
  useEffect(() => {
    if (!enabled || process.env.NODE_ENV !== "development") return;

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      const target = findCidTarget(e.target, rootRef.current);
      if (!target) {
        hoverElRef.current = null;
        setHoverEl(null);
        setHoverRect(null);
        return;
      }
      const cid = target.getAttribute("data-cid")?.trim();
      if (!cid) {
        hoverElRef.current = null;
        setHoverEl(null);
        setHoverRect(null);
        return;
      }
      hoverElRef.current = target;
      setHoverEl(target);
      setHoverRect(target.getBoundingClientRect());
    };

    const onClick = (e: MouseEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;

      const target = findCidTarget(e.target, root);
      const cid = target?.getAttribute("data-cid")?.trim();

      if (!target || !cid) {
        // Deselect — but keep persistent outlines
        setSelectedEl(null);
        setLiveRect(null);
        setViewingEntry(null);
        setComment("");
        setSaveError(null);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      setSelectedEl(target);
      setLiveRect(target.getBoundingClientRect());
      hoverElRef.current = null;
      setHoverEl(null);
      setHoverRect(null);

      const existing = savedEntries.get(cid);
      if (existing) {
        setViewingEntry(existing);
        setComment(existing.comment ?? "");
        setStatus(existing.status);
      } else {
        setViewingEntry(null);
        setComment("");
        setStatus("to-fix");
      }
      setSaveError(null);
    };

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [enabled, savedEntries]);

  // ── Save ──
  const saveReview = async () => {
    if (!selectedEl || isSaving) return;
    const cid = selectedEl.getAttribute("data-cid")?.trim();
    if (!cid) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      await postJson(serverUrl, "/review", {
        dataCid: cid,
        comment: comment.trim() || undefined,
        status,
      });

      // Screenshot — best effort
      const base64 = await captureElement(selectedEl);
      if (base64) {
        try {
          await postJson(serverUrl, "/review/screenshot", {
            dataCid: cid,
            base64,
          });
        } catch (err) {
          console.warn("[figma-code-link] screenshot upload failed:", err);
        }
      } else {
        console.info(
          "[figma-code-link] No screenshot captured for the selected element.",
        );
      }

      const saved: SavedEntry = {
        cid,
        comment: comment.trim() || undefined,
        status,
      };
      setSavedEntries((prev) => new Map(prev).set(cid, saved));
      setComment("");

      // Collapse popup — pin will appear on the persistent outline
      setSelectedEl(null);
      setLiveRect(null);
      setViewingEntry(null);
    } catch {
      setSaveError("Unable to save. Check server connection.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSelectedReview = async () => {
    if (!selectedCid || isDeleting) return;

    setIsDeleting(true);
    setSaveError(null);
    try {
      await deleteReview(serverUrl, selectedCid);

      setSavedEntries((prev) => {
        const next = new Map(prev);
        next.delete(selectedCid);
        return next;
      });

      setSelectedEl(null);
      setLiveRect(null);
      setViewingEntry(null);
      setComment("");
      setStatus("to-fix");
    } catch {
      setSaveError("Unable to delete review. Check server connection.");
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Derived ──
  const selectedCid = selectedEl?.getAttribute("data-cid")?.trim() ?? null;

  const popupPos = useMemo(
    () => (liveRect ? computePopupPosition(liveRect) : { top: 24, left: 24 }),
    [liveRect],
  );

  const hoverCid = hoverEl?.getAttribute("data-cid")?.trim() ?? null;
  const isHoverSaved = Boolean(hoverCid && savedEntries.has(hoverCid));

  if (process.env.NODE_ENV !== "development") return null;

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={rootRef}
      data-fcl-root="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483646,
        fontFamily: FONT,
      }}
    >
      {/* ── Toggle button + server status ── */}
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {/* Server connection status pill */}
        <div
          title={connected ? "Server connected" : "Server offline"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "0 9px",
            height: 34,
            background: C.bg,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: connected ? C.success : C.error,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: connected ? C.success : C.error,
              fontFamily: FONT,
              lineHeight: 1,
            }}
          >
            FCL
          </span>
        </div>
        {/* Pencil toggle button */}
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          title={enabled ? "Disable review overlay" : "Enable review overlay"}
          aria-label="Toggle Figma review overlay"
          style={{
            width: 34,
            height: 34,
            border: `1px solid ${enabled ? C.accent : C.border}`,
            borderRadius: 8,
            background: enabled ? C.accent : C.bg,
            color: C.text,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            fontFamily: FONT,
            padding: 0,
            transition: "background 0.12s, border-color 0.12s",
          }}
        >
          <PencilIcon size={14} />
        </button>
      </div>

      {/* ── Hover outline — hidden while an element is selected ── */}
      {enabled && hoverEl && hoverRect && !selectedEl && (
        <div
          style={{
            position: "fixed",
            left: hoverRect.left,
            top: hoverRect.top,
            width: Math.max(0, hoverRect.width),
            height: Math.max(0, hoverRect.height),
            border: `1.5px ${isHoverSaved ? "solid" : "dashed"} ${isHoverSaved ? C.success : C.accent}`,
            borderRadius: 3,
            background: isHoverSaved
              ? "rgba(74,222,128,0.05)"
              : "rgba(123,97,255,0.07)",
            pointerEvents: "none",
            zIndex: 2147483645,
            boxSizing: "border-box",
          }}
        >
          {/* CID chip on hover */}
          <div
            style={{
              position: "absolute",
              top: -1,
              left: -1,
              background: isHoverSaved ? C.success : C.accent,
              color: isHoverSaved ? "#000" : "#fff",
              fontSize: 9,
              fontFamily: MONO,
              padding: "2px 6px",
              borderRadius: "3px 0 3px 0",
              lineHeight: 1.5,
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
            }}
          >
            {hoverCid}
          </div>
        </div>
      )}

      {/* ── Persistent outlines for saved entries ── */}
      {enabled &&
        Array.from(savedEntries.entries()).map(([cid, entry]) => {
          // Don't render persistent outline for the currently selected element
          if (cid === selectedCid) return null;
          const rect = persistentRects.get(cid);
          if (!rect || rect.width === 0 || rect.height === 0) return null;
          return (
            <div key={cid}>
              {/* Outline */}
              <div
                style={{
                  position: "fixed",
                  left: rect.left,
                  top: rect.top,
                  width: Math.max(0, rect.width),
                  height: Math.max(0, rect.height),
                  border: `1.5px solid ${C.success}`,
                  borderRadius: 3,
                  background: "rgba(74,222,128,0.04)",
                  pointerEvents: "none",
                  zIndex: 2147483644,
                  boxSizing: "border-box",
                }}
              >
                {/* CID chip */}
                <div
                  style={{
                    position: "absolute",
                    top: -1,
                    left: -1,
                    background: C.success,
                    color: "#000",
                    fontSize: 9,
                    fontFamily: MONO,
                    padding: "2px 6px",
                    borderRadius: "3px 0 3px 0",
                    lineHeight: 1.5,
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.02em",
                  }}
                >
                  {cid}
                </div>
              </div>
              {/* Comment pin — Figma-style teardrop at bottom-left of outline */}
              <CommentPin
                entry={entry}
                rect={rect}
                onClick={() => {
                  // Re-find the element and open it
                  const el = persistentElsRef.current.get(cid);
                  if (!el) return;
                  setSelectedEl(el);
                  setLiveRect(el.getBoundingClientRect());
                  setViewingEntry(entry);
                  setComment("");
                  setSaveError(null);
                }}
              />
            </div>
          );
        })}

      {/* ── Active selection outline ── */}
      {enabled && selectedEl && liveRect && (
        <div
          style={{
            position: "fixed",
            left: liveRect.left,
            top: liveRect.top,
            width: Math.max(0, liveRect.width),
            height: Math.max(0, liveRect.height),
            border: `1.5px dashed ${C.accent}`,
            borderRadius: 3,
            background: "rgba(123,97,255,0.07)",
            pointerEvents: "none",
            zIndex: 2147483646,
            boxSizing: "border-box",
          }}
        >
          {/* CID label chip */}
          <div
            style={{
              position: "absolute",
              top: -1,
              left: -1,
              background: C.accent,
              color: "#fff",
              fontSize: 9,
              fontFamily: MONO,
              padding: "2px 6px",
              borderRadius: "3px 0 3px 0",
              lineHeight: 1.5,
              maxWidth: 260,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
            }}
          >
            {selectedCid}
          </div>
        </div>
      )}

      {/* ── Popup ── */}
      {enabled && selectedEl && liveRect && (
        <ReviewPopup
          selectedCid={selectedCid}
          viewingEntry={viewingEntry}
          comment={comment}
          status={status}
          isSaving={isSaving}
          isDeleting={isDeleting}
          saveError={saveError}
          popupPos={popupPos}
          onCommentChange={setComment}
          onStatusChange={setStatus}
          onClose={() => {
            setSelectedEl(null);
            setLiveRect(null);
            setViewingEntry(null);
            setComment("");
            setSaveError(null);
          }}
          onEdit={() => {
            if (viewingEntry) {
              setComment(viewingEntry.comment ?? "");
              setStatus(viewingEntry.status);
            }
            setViewingEntry(null);
          }}
          onDelete={() => {
            void deleteSelectedReview();
          }}
          onSave={() => {
            void saveReview();
          }}
        />
      )}
    </div>
  );
}

// ─── CommentPin ───────────────────────────────────────────────────────────────

function CommentPin({
  entry,
  rect,
  onClick,
}: {
  entry: SavedEntry;
  rect: DOMRect;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pinSize = 44;
  const pinInset = 8;
  const left = Math.min(
    Math.max(pinInset, rect.right - pinSize - pinInset),
    window.innerWidth - pinSize - pinInset,
  );
  const top = Math.min(
    Math.max(pinInset, rect.top + pinInset),
    window.innerHeight - pinSize - pinInset,
  );

  return (
    <div
      style={{
        position: "fixed",
        // Anchor near top-right of the outline, fully inside with padding
        left,
        top,
        pointerEvents: "auto",
        zIndex: 2147483645,
        userSelect: "none",
      }}
    >
      {/* Tooltip preview */}
      {hovered && entry.comment && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            width: 220,
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
            padding: "8px 10px",
            fontFamily: FONT,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: C.textDim,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {entry.status}
            {entry.figmaNodeId && (
              <span style={{ color: C.success, marginLeft: 6 }}>● linked</span>
            )}
          </div>
          <div
            style={{
              fontSize: 11,
              color: C.text,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {entry.comment}
          </div>
        </div>
      )}

      {/* Pin bubble — Figma teardrop: circle with squared bottom-left corner */}
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={`View comment on ${entry.cid}`}
        style={{
          width: pinSize,
          height: pinSize,
          borderRadius: "50% 50% 50% 0",
          background: entry.figmaNodeId ? C.success : C.accent,
          border: `1.5px solid rgba(255,255,255,0.15)`,
          cursor: "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
          color: entry.figmaNodeId ? "#000" : "#fff",
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1,
          transform: "rotate(0deg)",
          transition: "transform 0.1s, box-shadow 0.1s",
          ...(hovered && {
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
            transform: "scale(1.1)",
          }),
        }}
      >
        {/* Comment icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
}

// ─── ReviewPopup ──────────────────────────────────────────────────────────────

function ReviewPopup({
  selectedCid,
  viewingEntry,
  comment,
  status,
  isSaving,
  isDeleting,
  saveError,
  popupPos,
  onCommentChange,
  onStatusChange,
  onClose,
  onEdit,
  onDelete,
  onSave,
}: {
  selectedCid: string | null;
  viewingEntry: SavedEntry | null;
  comment: string;
  status: TaskStatus;
  isSaving: boolean;
  isDeleting: boolean;
  saveError: string | null;
  popupPos: { top: number; left: number };
  onCommentChange: (v: string) => void;
  onStatusChange: (v: TaskStatus) => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: popupPos.top,
        left: popupPos.left,
        width: 300,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        boxShadow: "0 20px 50px rgba(0,0,0,0.65)",
        pointerEvents: "auto",
        zIndex: 2147483647,
        overflow: "hidden",
        fontFamily: FONT,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "9px 12px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bgSecondary,
          gap: 6,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              color: C.textDim,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom: 2,
              fontFamily: FONT,
            }}
          >
            Component
          </div>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              fontFamily: MONO,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {selectedCid}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            color: C.textDim,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
            padding: "3px 5px",
            borderRadius: 4,
            fontFamily: FONT,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {viewingEntry ? (
        /* ── View mode ── */
        <div style={{ padding: "12px" }}>
          {/* Status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: C.textDim,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                fontFamily: FONT,
              }}
            >
              Status
            </span>
            <span
              style={{
                fontSize: 10,
                background: C.bgHover,
                color: C.text,
                borderRadius: 4,
                padding: "2px 7px",
                fontFamily: MONO,
                border: `1px solid ${C.border}`,
              }}
            >
              {viewingEntry.status}
            </span>
          </div>

          {/* Comment */}
          {viewingEntry.comment ? (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  marginBottom: 5,
                  fontFamily: FONT,
                }}
              >
                Comment
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.text,
                  lineHeight: 1.55,
                  background: C.bgSecondary,
                  borderRadius: 6,
                  padding: "8px 10px",
                  border: `1px solid ${C.border}`,
                  fontFamily: FONT,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {viewingEntry.comment}
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 11,
                color: C.textDim,
                fontStyle: "italic",
                fontFamily: FONT,
                marginBottom: 12,
              }}
            >
              No comment
            </div>
          )}

          {/* Footer row: link status pill + edit button */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* Link status pill */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 5,
                border: `1px solid ${viewingEntry.figmaNodeId ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.3)"}`,
                borderRadius: 6,
                padding: "5px 8px",
                background: viewingEntry.figmaNodeId
                  ? "rgba(74,222,128,0.07)"
                  : "rgba(251,191,36,0.07)",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: viewingEntry.figmaNodeId ? C.success : C.warning,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: viewingEntry.figmaNodeId ? C.success : C.warning,
                  fontFamily: FONT,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1,
                }}
              >
                {viewingEntry.figmaNodeId
                  ? (viewingEntry.figmaNodeName ?? "Linked")
                  : "Not linked"}
              </span>
            </div>

            {/* Edit button */}
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete review"
              title="Delete review"
              disabled={isDeleting}
              style={{
                border: `1px solid rgba(255,107,107,0.45)`,
                background: "rgba(255,107,107,0.08)",
                color: C.error,
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 11,
                cursor: isDeleting ? "default" : "pointer",
                fontFamily: FONT,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>

            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit review"
              title="Edit review"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                border: `1px solid ${C.border}`,
                background: C.bgSecondary,
                color: C.text,
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: FONT,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              <PencilIcon size={11} />
              Edit
            </button>
          </div>
        </div>
      ) : (
        /* ── Form mode ── */
        <div style={{ padding: "12px" }}>
          <label
            htmlFor="fcl-comment"
            style={{
              display: "block",
              fontSize: 9,
              color: C.textDim,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom: 5,
              fontFamily: FONT,
            }}
          >
            Comment
          </label>
          <textarea
            id="fcl-comment"
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            rows={3}
            placeholder="Describe the issue…"
            style={{
              width: "100%",
              resize: "vertical",
              background: C.bgSecondary,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "7px 9px",
              fontSize: 12,
              color: C.text,
              marginBottom: 10,
              boxSizing: "border-box",
              fontFamily: FONT,
              lineHeight: 1.5,
              outline: "none",
            }}
          />

          <label
            htmlFor="fcl-status"
            style={{
              display: "block",
              fontSize: 9,
              color: C.textDim,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom: 5,
              fontFamily: FONT,
            }}
          >
            Status
          </label>
          <select
            id="fcl-status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
            style={{
              width: "100%",
              background: C.bgSecondary,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "7px 9px",
              fontSize: 12,
              color: C.text,
              marginBottom: 12,
              fontFamily: FONT,
              cursor: "pointer",
              boxSizing: "border-box",
              WebkitAppearance: "none",
              appearance: "none",
            }}
          >
            <option value="to-fix">to-fix</option>
            <option value="review">review</option>
          </select>

          {saveError && (
            <div
              style={{
                fontSize: 11,
                color: C.error,
                marginBottom: 8,
                fontFamily: FONT,
              }}
            >
              {saveError}
            </div>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              style={{
                flex: 1,
                border: `1px solid ${C.border}`,
                background: C.bgSecondary,
                color: C.text,
                borderRadius: 6,
                padding: "7px 0",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              style={{
                flex: 2,
                border: "none",
                background: isSaving ? C.bgHover : C.accent,
                color: "#fff",
                borderRadius: 6,
                padding: "7px 0",
                fontSize: 11,
                fontWeight: 500,
                cursor: isSaving ? "default" : "pointer",
                fontFamily: FONT,
              }}
            >
              {isSaving ? "Saving…" : "Save review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
