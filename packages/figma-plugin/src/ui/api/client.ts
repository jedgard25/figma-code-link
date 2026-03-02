import type { TaskEntry, TaskStatus } from "../../shared/messages";

export const API_BASE = "http://localhost:7842";

export async function api(path: string, options?: RequestInit): Promise<any> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function getTasks(): Promise<TaskEntry[]> {
  const taskFile = (await api("/tasks")) as { entries?: TaskEntry[] };
  return Array.isArray(taskFile.entries) ? taskFile.entries : [];
}

export async function createTask(input: {
  figmaNodeId: string;
  figmaNodeName: string;
  comment?: string;
  status?: TaskStatus;
  layerTree?: string;
  componentsUsed?: string[];
}): Promise<TaskEntry> {
  return api("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<TaskEntry>;
}

export async function updateTask(
  figmaNodeId: string,
  input: {
    figmaNodeId?: string;
    figmaNodeName?: string;
    comment?: string;
    status?: TaskStatus;
  },
): Promise<TaskEntry> {
  return api(`/tasks/${encodeURIComponent(figmaNodeId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  }) as Promise<TaskEntry>;
}

export async function deleteTask(figmaNodeId: string): Promise<void> {
  await api(`/tasks/${encodeURIComponent(figmaNodeId)}`, { method: "DELETE" });
}

export async function clearTasks(): Promise<void> {
  await api("/tasks", { method: "DELETE" });
}

export async function getReviewEntries(): Promise<TaskEntry[]> {
  return (await api("/review")) as TaskEntry[];
}

export async function createReviewEntry(input: {
  dataCid: string;
  comment?: string;
  status?: TaskStatus;
}): Promise<TaskEntry> {
  const payload = (await api("/review", {
    method: "POST",
    body: JSON.stringify(input),
  })) as { entry: TaskEntry };

  return payload.entry;
}

export async function updateReviewEntry(
  dataCid: string,
  input: { comment?: string; status?: TaskStatus },
): Promise<TaskEntry> {
  const payload = (await api(`/review/${encodeURIComponent(dataCid)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })) as { entry: TaskEntry };

  return payload.entry;
}

export async function linkReviewEntry(
  dataCid: string,
  figmaNodeId: string,
  figmaNodeName: string,
  comment?: string,
  status?: TaskStatus,
  layerTree?: string,
  componentsUsed?: string[],
): Promise<TaskEntry> {
  const payload = (await api(`/review/${encodeURIComponent(dataCid)}/link`, {
    method: "PUT",
    body: JSON.stringify({
      figmaNodeId,
      figmaNodeName,
      comment,
      status,
      layerTree,
      componentsUsed,
    }),
  })) as { entry: TaskEntry };

  return payload.entry;
}

export async function deleteReviewEntry(dataCid: string): Promise<void> {
  await api(`/review/${encodeURIComponent(dataCid)}`, { method: "DELETE" });
}

export async function clearReviewEntries(): Promise<void> {
  await api("/review", { method: "DELETE" });
}
