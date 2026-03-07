export type TaskStatus = "to-build" | "to-fix" | "review" | "completed";

export interface TaskEntry {
  figmaNodeId?: string;
  figmaNodeName?: string;
  dataCid?: string;
  type?: "build" | "review";
  domThumbnailPath?: string;
  comment?: string;
  status: TaskStatus;
  layerTree?: string;
  componentsUsed?: string[];
}

export interface TaskFile {
  version: 2;
  entries: TaskEntry[];
}

export interface StartFigmaLinkServerOptions {
  port?: number;
  filePath?: string;
  screenshotDir?: string;
}

export interface CreateTaskInput {
  figmaNodeId: string;
  figmaNodeName: string;
  type?: "build" | "review";
  comment?: string;
  status?: TaskStatus;
  layerTree?: string;
  componentsUsed?: string[];
}

export interface CreateReviewInput {
  dataCid: string;
  comment?: string;
  status?: TaskStatus;
  domThumbnailPath?: string;
  layerTree?: string;
  componentsUsed?: string[];
}

export interface UpdateTaskInput {
  figmaNodeId?: string;
  figmaNodeName?: string;
  comment?: string;
  status?: TaskStatus;
  domThumbnailPath?: string;
  layerTree?: string;
  componentsUsed?: string[];
}