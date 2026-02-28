import type { Express, Request, Response } from "express";
import type { TaskStore } from "./store";

function parseErrorStatus(message: string): number {
  if (message.includes("required") || message.includes("Invalid status")) {
    return 400;
  }

  if (message.includes("not found")) {
    return 404;
  }

  return 500;
}

export function registerRoutes(app: Express, store: TaskStore): void {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get("/tasks", (_req: Request, res: Response) => {
    res.json(store.getAll());
  });

  app.post("/tasks", (req: Request, res: Response) => {
    try {
      const entry = store.create(req.body ?? {});
      res.status(201).json(entry);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create task";
      res.status(parseErrorStatus(message)).json({ error: message });
    }
  });

  app.put("/tasks/:entryId", (req: Request, res: Response) => {
    try {
      const entry = store.update(req.params.entryId, req.body ?? {});
      res.json(entry);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update task";
      res.status(parseErrorStatus(message)).json({ error: message });
    }
  });

  app.delete("/tasks/:entryId", (req: Request, res: Response) => {
    const deleted = store.delete(req.params.entryId);
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
}
