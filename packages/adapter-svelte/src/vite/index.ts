import type { Server } from "node:http";
import type { StartFigmaLinkServerOptions } from "figma-code-link-core";

export interface FigmaLinkVitePluginOptions extends StartFigmaLinkServerOptions {
  enabled?: boolean;
}

type DevServerLike = {
  httpServer?: {
    once(event: "close", listener: () => void): unknown;
  } | null;
};

export interface FigmaLinkVitePlugin {
  name: string;
  apply?: "serve" | "build";
  configureServer?(server: DevServerLike): void | Promise<void>;
}

const SERVER_STATE_KEY = Symbol.for("figma-code-link.svelte.dev-server");

type SharedState = {
  instance: Server;
  signature: string;
};

function getSharedState(): SharedState | undefined {
  return (
    globalThis as typeof globalThis & { [SERVER_STATE_KEY]?: SharedState }
  )[SERVER_STATE_KEY];
}

function setSharedState(state: SharedState | undefined): void {
  const globals = globalThis as typeof globalThis & {
    [SERVER_STATE_KEY]?: SharedState;
  };
  if (state) {
    globals[SERVER_STATE_KEY] = state;
    return;
  }

  delete globals[SERVER_STATE_KEY];
}

function buildSignature(options: FigmaLinkVitePluginOptions): string {
  return JSON.stringify({
    port: options.port ?? 7842,
    filePath: options.filePath ?? null,
    screenshotDir: options.screenshotDir ?? null,
  });
}

export function createFigmaLinkVitePlugin(
  options: FigmaLinkVitePluginOptions = {},
): FigmaLinkVitePlugin {
  return {
    name: "figma-code-link-svelte",
    apply: "serve",
    async configureServer(server) {
      if (options.enabled === false) {
        return;
      }

      const { startFigmaLinkServer } = await import("figma-code-link-core");

      const signature = buildSignature(options);
      const current = getSharedState();
      if (!current) {
        setSharedState({
          instance: startFigmaLinkServer(options),
          signature,
        });
      } else if (current.signature !== signature) {
        throw new Error(
          "figma-code-link-svelte was initialized multiple times with different server options in the same process.",
        );
      }

      server.httpServer?.once("close", () => {
        const shared = getSharedState();
        if (!shared) {
          return;
        }

        if (shared.instance.listening) {
          shared.instance.close();
        }
        setSharedState(undefined);
      });
    },
  };
}

export const figmaLinkVitePlugin = createFigmaLinkVitePlugin;
