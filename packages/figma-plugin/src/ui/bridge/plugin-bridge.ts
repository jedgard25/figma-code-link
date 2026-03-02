import type {
  PluginToUiMessage,
  UiToPluginMessage,
} from "../../shared/messages";

export function postToSandbox(payload: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: payload }, "*");
}

export function attachPluginBridge(
  onMessage: (message: PluginToUiMessage) => void,
): void {
  window.onmessage = (
    event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>,
  ) => {
    const message = event.data?.pluginMessage;
    if (!message) {
      return;
    }

    onMessage(message);
  };
}
