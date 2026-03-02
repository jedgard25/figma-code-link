import { exportNodeThumbnail } from "./thumbnail";
import { generateLayerTreeSnapshot } from "./layer-tree";
import type { PluginToUiMessage, UiToPluginMessage } from "../shared/messages";

declare const figma: any;
declare const __html__: string;

figma.showUI(__html__, { width: 360, height: 540, title: "Figma Code Link" });

function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

figma.ui.onmessage = async (rawMessage: UiToPluginMessage) => {
  if (rawMessage.type === "POLL_SELECTION") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      postToUi({
        type: "SELECTION_DATA",
        hasSelection: false,
        nodeId: null,
        nodeName: null,
      });
      return;
    }

    const node = selection[0];
    postToUi({
      type: "SELECTION_DATA",
      hasSelection: true,
      nodeId: node.id,
      nodeName: node.name,
    });
    return;
  }

  if (rawMessage.type === "EXPORT_THUMBNAIL") {
    const nodeId = String(rawMessage.nodeId ?? "");
    try {
      const base64 = await exportNodeThumbnail(nodeId);
      postToUi({
        type: "THUMBNAIL_DATA",
        nodeId,
        base64,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Thumbnail export failed";
      postToUi({
        type: "THUMBNAIL_ERROR",
        nodeId,
        error: message,
      });
    }
    return;
  }

  if (rawMessage.type === "EXPORT_LAYER_TREE") {
    const nodeId = String(rawMessage.nodeId ?? "");
    try {
      const snapshot = generateLayerTreeSnapshot(nodeId);
      postToUi({
        type: "LAYER_TREE_DATA",
        nodeId,
        tree: snapshot.tree,
        componentsUsed: snapshot.componentsUsed,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Layer tree export failed";
      postToUi({
        type: "LAYER_TREE_ERROR",
        nodeId,
        error: message,
      });
    }
    return;
  }

  if (rawMessage.type === "NOTIFY") {
    figma.notify(rawMessage.message ?? "");
    return;
  }

  if (rawMessage.type === "CLOSE") {
    figma.closePlugin();
  }
};
