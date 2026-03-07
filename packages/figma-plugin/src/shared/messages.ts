export type { TaskEntry, TaskStatus } from "figma-code-link-core";

export interface SelectionPayload {
  nodeId: string;
  nodeName: string;
}

export type UiToPluginMessage =
  | { type: "POLL_SELECTION" }
  | { type: "EXPORT_THUMBNAIL"; nodeId: string }
  | { type: "EXPORT_LAYER_TREE"; nodeId: string }
  | { type: "NOTIFY"; message: string }
  | { type: "CLOSE" };

export type PluginToUiMessage =
  | {
      type: "SELECTION_DATA";
      hasSelection: false;
      nodeId: null;
      nodeName: null;
    }
  | {
      type: "SELECTION_DATA";
      hasSelection: true;
      nodeId: string;
      nodeName: string;
    }
  | {
      type: "THUMBNAIL_DATA";
      nodeId: string;
      base64: string;
    }
  | {
      type: "THUMBNAIL_ERROR";
      nodeId: string;
      error: string;
    }
  | {
      type: "LAYER_TREE_DATA";
      nodeId: string;
      tree: string;
      componentsUsed: string[];
    }
  | {
      type: "LAYER_TREE_ERROR";
      nodeId: string;
      error: string;
    };
