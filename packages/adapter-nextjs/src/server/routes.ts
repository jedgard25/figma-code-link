import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import type { TaskStore } from "./store";
import { AppError } from "./store";

const SCREEN_DIR = path.join(process.cwd(), ".figma-link", "screens");

function sendError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : fallback;
  res.status(500).json({ error: message });
}

function sanitizeCid(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
}

function ensureScreenDirectory(): void {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
}

function decodeBase64Payload(value: string): Buffer {
  const match = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  const base64 = match ? match[1] : value;
  return Buffer.from(base64, "base64");
}

function buildRelativeScreenPath(fileName: string): string {
  return path.posix.join(".figma-link", "screens", fileName);
}

function getReviewEntries(store: TaskStore) {
  return store.getReviewEntries();
}

function getBuildTasks(store: TaskStore) {
  const all = store.getAll();
  return {
    ...all,
    entries: all.entries.filter((entry) => (entry.type ?? "build") === "build"),
  };
}

export function registerRoutes(app: Express, store: TaskStore): void {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get("/tasks", (_req: Request, res: Response) => {
    res.json(getBuildTasks(store));
  });

  app.post("/tasks", (req: Request, res: Response) => {
    try {
      const entry = store.create(req.body ?? {});
      res.status(201).json(entry);
    } catch (error) {
      sendError(res, error, "Unable to create task");
    }
  });

  app.put("/tasks/:figmaNodeId", (req: Request, res: Response) => {
    try {
      const entry = store.update(req.params.figmaNodeId, req.body ?? {});
      res.json(entry);
    } catch (error) {
      sendError(res, error, "Unable to update task");
    }
  });

  app.delete("/tasks/:figmaNodeId", (req: Request, res: Response) => {
    const deleted = store.delete(req.params.figmaNodeId);
    if (!deleted) {
      res.status(404).json({ error: "Task entry not found" });
      return;
    }

    res.json({ deleted: true });
  });

  app.delete("/tasks", (_req: Request, res: Response) => {
    store.clear();
    res.json({ cleared: true });
  });

  app.get("/review", (_req: Request, res: Response) => {
    res.json(getReviewEntries(store));
  });

  app.post("/review", (req: Request, res: Response) => {
    try {
      const entry = store.createReview(req.body ?? {});
      res.status(201).json({ entry });
    } catch (error) {
      sendError(res, error, "Unable to create review entry");
    }
  });

  app.put("/review/:dataCid", (req: Request, res: Response) => {
    try {
      const entry = store.updateReview(
        decodeURIComponent(req.params.dataCid),
        req.body ?? {},
      );
      res.json({ entry });
    } catch (error) {
      sendError(res, error, "Unable to update review entry");
    }
  });

  app.put("/review/:dataCid/link", (req: Request, res: Response) => {
    try {
      const dataCid = decodeURIComponent(req.params.dataCid);
      const figmaNodeId = String(req.body?.figmaNodeId ?? "");
      const figmaNodeName = String(req.body?.figmaNodeName ?? "");
      const entry = store.linkReview(dataCid, figmaNodeId, figmaNodeName);

      if (
        typeof req.body?.comment === "string" ||
        req.body?.status ||
        typeof req.body?.layerTree === "string" ||
        Array.isArray(req.body?.componentsUsed)
      ) {
        const updated = store.updateReview(dataCid, {
          comment:
            typeof req.body?.comment === "string"
              ? req.body.comment
              : undefined,
          status: req.body?.status,
          layerTree:
            typeof req.body?.layerTree === "string"
              ? req.body.layerTree
              : undefined,
          componentsUsed: Array.isArray(req.body?.componentsUsed)
            ? req.body.componentsUsed
            : undefined,
        });
        res.json({ entry: updated });
        return;
      }

      res.json({ entry });
    } catch (error) {
      sendError(res, error, "Unable to link review entry");
    }
  });

  app.delete("/review/:dataCid", (req: Request, res: Response) => {
    const deleted = store.deleteReview(decodeURIComponent(req.params.dataCid));
    if (!deleted) {
      res.status(404).json({ error: "Review entry not found" });
      return;
    }

    res.json({ deleted: true });
  });

  app.delete("/review", (_req: Request, res: Response) => {
    store.clearReview();
    res.json({ cleared: true });
  });

  app.post("/review/screenshot", (req: Request, res: Response) => {
    try {
      const dataCid = String(req.body?.dataCid ?? "").trim();
      const base64 = String(req.body?.base64 ?? "").trim();
      if (!dataCid || !base64) {
        throw new AppError(400, "dataCid and base64 are required");
      }

      const safeCid = sanitizeCid(dataCid);
      const filename = `${safeCid}.png`;
      const absolutePath = path.join(SCREEN_DIR, filename);
      const relativePath = buildRelativeScreenPath(filename);

      ensureScreenDirectory();
      fs.writeFileSync(absolutePath, decodeBase64Payload(base64));
      try {
        store.updateReview(dataCid, { domThumbnailPath: relativePath });
      } catch (error) {
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
        }

        throw error;
      }

      res.status(201).json({ path: relativePath });
    } catch (error) {
      sendError(res, error, "Unable to store screenshot");
    }
  });

  app.get("/review/screenshot/:filename", (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename);
    const absolutePath = path.join(SCREEN_DIR, safeName);
    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ error: "Screenshot not found" });
      return;
    }

    const file = fs.readFileSync(absolutePath);
    res.type("png").send(file);
  });
}
