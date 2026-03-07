import fs from "node:fs";
import path from "node:path";
import type {
  CreateReviewInput,
  CreateTaskInput,
  TaskEntry,
  TaskFile,
  TaskStatus,
  UpdateTaskInput,
} from "../types";

const DEFAULT_FILE = "figma-tasks.json";
const VALID_STATUSES: TaskStatus[] = [
  "to-build",
  "to-fix",
  "review",
  "completed",
];

export class AppError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

function getDefaultPath(): string {
  return path.join(process.cwd(), DEFAULT_FILE);
}

function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function getInitialTaskFile(): TaskFile {
  return {
    version: 2,
    entries: [],
  };
}

function isStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" && VALID_STATUSES.includes(value as TaskStatus)
  );
}

function normalizeEntry(entry: unknown): TaskEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Record<string, unknown>;
  const type = candidate.type === "review" ? "review" : "build";
  const figmaNodeId =
    typeof candidate.figmaNodeId === "string" && candidate.figmaNodeId.trim()
      ? candidate.figmaNodeId.trim()
      : undefined;
  const figmaNodeName =
    typeof candidate.figmaNodeName === "string" &&
    candidate.figmaNodeName.trim()
      ? candidate.figmaNodeName.trim()
      : undefined;
  const dataCid =
    typeof candidate.dataCid === "string" && candidate.dataCid.trim()
      ? candidate.dataCid.trim()
      : undefined;

  if (type === "build" && (!figmaNodeId || !figmaNodeName)) {
    return null;
  }

  if (type === "review" && !dataCid) {
    return null;
  }

  const status = isStatus(candidate.status)
    ? candidate.status
    : type === "review"
      ? "to-fix"
      : "to-build";
  const comment =
    typeof candidate.comment === "string" && candidate.comment.trim()
      ? candidate.comment.trim()
      : undefined;
  const layerTree =
    typeof candidate.layerTree === "string" && candidate.layerTree.trim()
      ? candidate.layerTree.trim()
      : undefined;
  const declaredComponentsUsed = Array.isArray(candidate.componentsUsed)
    ? Array.from(
        new Set(
          candidate.componentsUsed
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean),
        ),
      )
    : undefined;
  const inferredComponentsUsed = layerTree
    ? Array.from(
        new Set(
          Array.from(
            layerTree.matchAll(/component="([^"]+)"/g),
            (match) => match[1]?.trim() ?? "",
          ).filter(Boolean),
        ),
      )
    : undefined;
  const componentsUsed =
    declaredComponentsUsed && declaredComponentsUsed.length > 0
      ? declaredComponentsUsed
      : inferredComponentsUsed;
  const domThumbnailPath =
    typeof candidate.domThumbnailPath === "string" &&
    candidate.domThumbnailPath.trim()
      ? candidate.domThumbnailPath.trim()
      : undefined;

  return {
    figmaNodeId,
    figmaNodeName,
    dataCid,
    type,
    domThumbnailPath,
    comment,
    status,
    layerTree,
    componentsUsed: componentsUsed?.length ? componentsUsed : undefined,
  };
}

function normalizeTaskFile(taskFile: TaskFile): TaskFile {
  const uniqueByIdentity = new Map<string, TaskEntry>();

  taskFile.entries.forEach((entry) => {
    const normalized = normalizeEntry(entry);
    if (!normalized) {
      return;
    }

    const key =
      normalized.type === "review"
        ? `review:${normalized.dataCid ?? ""}`
        : `build:${normalized.figmaNodeId ?? ""}`;

    if (!uniqueByIdentity.has(key)) {
      uniqueByIdentity.set(key, normalized);
    }
  });

  return {
    version: 2,
    entries: Array.from(uniqueByIdentity.values()),
  };
}

export class TaskStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultPath();
  }

  getPath(): string {
    return this.filePath;
  }

  readTaskFile(): TaskFile {
    if (!fs.existsSync(this.filePath)) {
      return getInitialTaskFile();
    }

    const raw = fs.readFileSync(this.filePath, "utf8").trim();
    if (!raw) {
      return getInitialTaskFile();
    }

    try {
      const parsed = JSON.parse(raw) as TaskFile;
      if (!Array.isArray(parsed.entries)) {
        return getInitialTaskFile();
      }

      return normalizeTaskFile(parsed);
    } catch {
      return getInitialTaskFile();
    }
  }

  writeTaskFile(taskFile: TaskFile): TaskFile {
    const normalized = normalizeTaskFile(taskFile);
    ensureParentDirectory(this.filePath);
    fs.writeFileSync(
      this.filePath,
      `${JSON.stringify(normalized, null, 2)}\n`,
      "utf8",
    );
    return normalized;
  }

  getAll(): TaskFile {
    const taskFile = this.readTaskFile();
    if (!fs.existsSync(this.filePath)) {
      this.writeTaskFile(taskFile);
    }
    return taskFile;
  }

  create(input: CreateTaskInput): TaskEntry {
    if (!input.figmaNodeId || !input.figmaNodeName) {
      throw new AppError(400, "figmaNodeId and figmaNodeName are required");
    }

    if (input.status && !isStatus(input.status)) {
      throw new AppError(400, "Invalid status value");
    }

    const taskFile = this.readTaskFile();
    const entry: TaskEntry = {
      figmaNodeId: input.figmaNodeId,
      figmaNodeName: input.figmaNodeName,
      type: input.type === "review" ? "review" : "build",
      comment: input.comment,
      status: input.status ?? "to-build",
      layerTree: input.layerTree,
      componentsUsed: input.componentsUsed,
    };

    taskFile.entries = taskFile.entries.filter(
      (existing) =>
        !(
          (existing.type ?? "build") === "build" &&
          existing.figmaNodeId === input.figmaNodeId
        ),
    );
    taskFile.entries.unshift(entry);
    this.writeTaskFile(taskFile);
    return entry;
  }

  createReview(input: CreateReviewInput): TaskEntry {
    if (!input.dataCid || !input.dataCid.trim()) {
      throw new AppError(400, "dataCid is required");
    }

    if (input.status && !isStatus(input.status)) {
      throw new AppError(400, "Invalid status value");
    }

    const taskFile = this.readTaskFile();
    const entry: TaskEntry = {
      type: "review",
      dataCid: input.dataCid.trim(),
      comment: input.comment,
      status: input.status ?? "to-fix",
      domThumbnailPath: input.domThumbnailPath,
      layerTree: input.layerTree,
      componentsUsed: input.componentsUsed,
    };

    taskFile.entries = taskFile.entries.filter(
      (existing) =>
        !(
          (existing.type ?? "build") === "review" &&
          existing.dataCid === entry.dataCid
        ),
    );
    taskFile.entries.unshift(entry);
    this.writeTaskFile(taskFile);
    return entry;
  }

  update(figmaNodeId: string, input: UpdateTaskInput): TaskEntry {
    const taskFile = this.readTaskFile();
    const index = taskFile.entries.findIndex(
      (entry) =>
        (entry.type ?? "build") === "build" &&
        entry.figmaNodeId === figmaNodeId,
    );

    if (index < 0) {
      throw new AppError(404, "Task entry not found");
    }

    if (input.status !== undefined && !isStatus(input.status)) {
      throw new AppError(400, "Invalid status value");
    }

    if (input.figmaNodeId !== undefined && !input.figmaNodeId.trim()) {
      throw new AppError(400, "figmaNodeId cannot be empty");
    }

    if (input.figmaNodeName !== undefined && !input.figmaNodeName.trim()) {
      throw new AppError(400, "figmaNodeName cannot be empty");
    }

    const existing = taskFile.entries[index];
    const updated: TaskEntry = {
      ...existing,
      ...input,
    };

    taskFile.entries[index] = updated;
    this.writeTaskFile(taskFile);
    return updated;
  }

  linkReview(
    dataCid: string,
    figmaNodeId: string,
    figmaNodeName: string,
  ): TaskEntry {
    if (!dataCid.trim() || !figmaNodeId.trim() || !figmaNodeName.trim()) {
      throw new AppError(
        400,
        "dataCid, figmaNodeId, and figmaNodeName are required",
      );
    }

    const taskFile = this.readTaskFile();
    const index = taskFile.entries.findIndex(
      (entry) =>
        (entry.type ?? "build") === "review" && entry.dataCid === dataCid,
    );

    if (index < 0) {
      throw new AppError(404, "Review entry not found");
    }

    const updated: TaskEntry = {
      ...taskFile.entries[index],
      figmaNodeId,
      figmaNodeName,
    };

    taskFile.entries[index] = updated;
    this.writeTaskFile(taskFile);
    return updated;
  }

  delete(figmaNodeId: string): boolean {
    const taskFile = this.readTaskFile();
    const originalLength = taskFile.entries.length;
    taskFile.entries = taskFile.entries.filter(
      (entry) =>
        !(
          (entry.type ?? "build") === "build" &&
          entry.figmaNodeId === figmaNodeId
        ),
    );
    const deleted = taskFile.entries.length !== originalLength;

    if (deleted) {
      this.writeTaskFile(taskFile);
    }

    return deleted;
  }

  deleteReview(dataCid: string): boolean {
    const taskFile = this.readTaskFile();
    const originalLength = taskFile.entries.length;
    taskFile.entries = taskFile.entries.filter(
      (entry) =>
        !((entry.type ?? "build") === "review" && entry.dataCid === dataCid),
    );
    const deleted = taskFile.entries.length !== originalLength;

    if (deleted) {
      this.writeTaskFile(taskFile);
    }

    return deleted;
  }

  getReviewEntries(): TaskEntry[] {
    return this.readTaskFile().entries.filter(
      (entry) => (entry.type ?? "build") === "review",
    );
  }

  updateReview(dataCid: string, input: UpdateTaskInput): TaskEntry {
    const taskFile = this.readTaskFile();
    const index = taskFile.entries.findIndex(
      (entry) =>
        (entry.type ?? "build") === "review" && entry.dataCid === dataCid,
    );

    if (index < 0) {
      throw new AppError(404, "Review entry not found");
    }

    if (input.status !== undefined && !isStatus(input.status)) {
      throw new AppError(400, "Invalid status value");
    }

    const updated: TaskEntry = {
      ...taskFile.entries[index],
      ...input,
      type: "review",
      dataCid,
    };

    taskFile.entries[index] = updated;
    this.writeTaskFile(taskFile);
    return updated;
  }

  clearReview(): void {
    const taskFile = this.readTaskFile();
    taskFile.entries = taskFile.entries.filter(
      (entry) => (entry.type ?? "build") !== "review",
    );
    this.writeTaskFile(taskFile);
  }

  clear(): void {
    this.writeTaskFile({
      version: 2,
      entries: [],
    });
  }
}

export function createTaskStore(filePath?: string): TaskStore {
  return new TaskStore(filePath);
}
