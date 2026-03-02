"use client";

// Status is now owned by DomReviewOverlay — rendered inline with the toggle button.
// This component is kept as a no-op for backwards-compatibility with consumer layout.tsx files.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface FigmaCodeLinkProps {
  serverUrl?: string;
  healthPollMs?: number;
}

export function FigmaCodeLink(_props: FigmaCodeLinkProps) {
  return null;
}
