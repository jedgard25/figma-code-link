import cors from "cors";
import express from "express";
import type { Server } from "node:http";
import type { StartFigmaLinkServerOptions } from "../types";
import { registerRoutes } from "./routes";
import { createTaskStore } from "./store";

export function startFigmaLinkServer(
  options: StartFigmaLinkServerOptions = {},
): Server {
  const app = express();
  const port = options.port ?? 7842;
  const store = createTaskStore(options.filePath);

  app.use(cors({ origin: true }));
  app.use(express.json());

  registerRoutes(app, store);

  return app.listen(port, () => {
    const filePath = store.getPath();
    process.stdout.write(
      `Figma Code Link server listening on http://localhost:${port} (tasks: ${filePath})\n`,
    );
  });
}
