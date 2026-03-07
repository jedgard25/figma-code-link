# Figma Code Link Next.js Adapter

This package provides the React overlay, JSX CID injection, and shared server helpers for Figma Code Link in Next.js applications.

## Quick Start

Install the package and mount the runtime overlay in a development-only layout boundary.

```tsx
import { DomReviewOverlay } from "figma-code-link-nextjs";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <DomReviewOverlay />
      </body>
    </html>
  );
}
```

Run the local server in development.

```ts
import { startFigmaLinkServer } from "figma-code-link-nextjs";

startFigmaLinkServer();
```

Enable CID injection in development with the Babel plugin.

```js
module.exports = {
  plugins:
    process.env.NODE_ENV === "development"
      ? ["figma-code-link-nextjs/babel/cid-preprocessor"]
      : [],
};
```

## Notes

- The server, task store, and HTTP API are shared with the Svelte adapter through `figma-code-link-core`.
- Screenshot capture now ships with the adapter package. Consumer apps no longer need to add `html2canvas` themselves for the standard review flow.
- `figma-tasks.json` remains the single source of truth. Screenshots are stored under `.figma-link/screens/`.
- If automatic CID injection is unsafe for a specific element, add an explicit `data-cid` manually.

## Manual Server Fallback

For nonstandard environments, use the bundled CLI:

```bash
figma-link-server
```
