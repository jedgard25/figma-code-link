import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type {
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

function getDefaultPath(): string {
  return path.join(process.cwd(), DEFAULT_FILE);
}

function ensureParentDirectory(filePath: string): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

function getInitialTaskFile(): TaskFile {
  return {
    version: 1,
    entries: [],
  };
}

function isStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" && VALID_STATUSES.includes(value as TaskStatus)
  );
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

      return {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        entries: parsed.entries,
      };
    } catch {
      return getInitialTaskFile();
    }
  }

  writeTaskFile(taskFile: TaskFile): TaskFile {
    ensureParentDirectory(this.filePath);
    fs.writeFileSync(
      this.filePath,
      `${JSON.stringify(taskFile, null, 2)}\n`,
      "utf8",
    );
    return taskFile;
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
      throw new Error("figmaNodeId and figmaNodeName are required");
    }

    if (input.status && !isStatus(input.status)) {
      throw new Error("Invalid status value");
    }

    const taskFile = this.readTaskFile();
    const entry: TaskEntry = {
      entryId: uuidv4(),
      figmaNodeId: input.figmaNodeId,
      figmaNodeName: input.figmaNodeName,
      comment: input.comment,
      status: input.status ?? "to-build",
      timestamp: new Date().toISOString(),
    };

    taskFile.entries.unshift(entry);
    this.writeTaskFile(taskFile);
    return entry;
  }

  update(entryId: string, input: UpdateTaskInput): TaskEntry {
    const taskFile = this.readTaskFile();
    const index = taskFile.entries.findIndex(
      (entry) => entry.entryId === entryId,
    );

    if (index < 0) {
      throw new Error("Task entry not found");
    }

    if (input.status !== undefined && !isStatus(input.status)) {
      throw new Error("Invalid status value");
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

  delete(entryId: string): boolean {
    const taskFile = this.readTaskFile();
    const originalLength = taskFile.entries.length;
    taskFile.entries = taskFile.entries.filter(
      (entry) => entry.entryId !== entryId,
    );
    const deleted = taskFile.entries.length !== originalLength;

    if (deleted) {
      this.writeTaskFile(taskFile);
    }

    return deleted;
  }

  clear(): void {
    this.writeTaskFile({
      version: 1,
      entries: [],
    });
  }
}

export function createTaskStore(filePath?: string): TaskStore {
  return new TaskStore(filePath);
}
