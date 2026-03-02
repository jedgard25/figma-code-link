export interface BindActionHandlers {
  onAction: (action: string, entryId: string | null) => Promise<void>;
  onNameInput: (value: string) => void;
  onCommentInput: (value: string) => void;
  onStatusInput: (value: string) => void;
}

export function bindEvents(handlers: BindActionHandlers): void {
  document.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      const currentTarget = event.currentTarget as HTMLElement;
      const action = currentTarget.getAttribute("data-action") ?? "";
      const entryId = currentTarget.getAttribute("data-entry-id");
      await handlers.onAction(action, entryId);
    });
  });

  const nameInput = document.getElementById(
    "modal-name",
  ) as HTMLInputElement | null;
  if (nameInput) {
    nameInput.addEventListener("input", (event) => {
      handlers.onNameInput((event.target as HTMLInputElement).value);
    });
  }

  const commentInput = document.getElementById(
    "modal-comment",
  ) as HTMLTextAreaElement | null;
  if (commentInput) {
    commentInput.addEventListener("input", (event) => {
      handlers.onCommentInput((event.target as HTMLTextAreaElement).value);
    });
  }

  const statusInput = document.getElementById(
    "modal-status",
  ) as HTMLSelectElement | null;
  if (statusInput) {
    statusInput.addEventListener("change", (event) => {
      handlers.onStatusInput((event.target as HTMLSelectElement).value);
    });
  }
}
