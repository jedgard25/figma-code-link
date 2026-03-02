import type {
  SelectionPayload,
  TaskEntry,
  TaskStatus,
} from "../../shared/messages";

export type ViewName = "server" | "build" | "review" | "settings";

export interface AppSettings {
  generateLayerTree: boolean;
}

const SETTINGS_STORAGE_KEY = "fcl_settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        generateLayerTree: Boolean(parsed.generateLayerTree ?? true),
      };
    }
  } catch {
    // ignore
  }
  return { generateLayerTree: true };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export interface ModalState {
  mode: "create" | "edit" | "link";
  step: "select" | "metadata";
  selected: SelectionPayload | null;
  linkingEntry?: TaskEntry;
  name: string;
  comment: string;
  status: TaskStatus;
  thumbnail: string | null;
  /** Layer tree string, populated when generateLayerTree setting is on */
  layerTree?: string | null;
  /** Component deps extracted from layer tree generation. */
  layerTreeComponents?: string[];
}

export interface AppState {
  currentView: ViewName;
  entries: TaskEntry[];
  reviewEntries: TaskEntry[];
  thumbnails: Record<string, string | null | undefined>;
  healthTimer: ReturnType<typeof setInterval> | null;
  selectionTimer: ReturnType<typeof setInterval> | null;
  modal: ModalState | null;
  settings: AppSettings;
}

export function createInitialState(): AppState {
  return {
    currentView: "server",
    entries: [],
    reviewEntries: [],
    thumbnails: {},
    healthTimer: null,
    selectionTimer: null,
    modal: null,
    settings: loadSettings(),
  };
}
