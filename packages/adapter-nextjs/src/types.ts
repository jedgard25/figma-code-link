export type TaskStatus = "to-build" | "to-fix" | "review" | "completed";

export interface TaskEntry {
  entryId: string;
  figmaNodeId: string;
  figmaNodeName: string;
  comment?: string;
  status: TaskStatus;
  timestamp: string;
}

export interface TaskFile {
  version: number;
  entries: TaskEntry[];
}

export interface StartFigmaLinkServerOptions {
  port?: number;
  filePath?: string;
}

export interface CreateTaskInput {
  figmaNodeId: string;
  figmaNodeName: string;
  comment?: string;
  status?: TaskStatus;
}

export interface UpdateTaskInput {
  figmaNodeId?: string;
  figmaNodeName?: string;
  comment?: string;
  status?: TaskStatus;
}
