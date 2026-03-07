import cors from "cors";
import express from "express";
import { createServer, type Server } from "node:http";
import type { StartFigmaLinkServerOptions } from "../types";
import { registerRoutes } from "./routes";
import { createTaskStore } from "./store";

export function startFigmaLinkServer(
  options: StartFigmaLinkServerOptions = {},
): Server {
  const app = express();
  const port = options.port ?? 7842;
  const store = createTaskStore(options.filePath);
  const server = createServer(app);

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "25mb" }));

  registerRoutes(app, store, options);

  server.once("listening", () => {
    process.stdout.write(
      `Figma Code Link server listening on http://localhost:${port} (tasks: ${store.getPath()})\n`,
    );
  });

  server.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      process.stdout.write(
        `Figma Code Link server already running on http://localhost:${port}; reusing existing instance\n`,
      );
      return;
    }

    throw error;
  });

  server.listen(port);

  return server;
}

export { registerRoutes } from "./routes";
export { AppError, createTaskStore, TaskStore } from "./store";
