export { default as DomReviewOverlay } from "./components/DomReviewOverlay.svelte";
export { default as FigmaCodeLink } from "./components/FigmaCodeLink.svelte";
export type {
  CreateReviewInput,
  CreateTaskInput,
  StartFigmaLinkServerOptions,
  TaskEntry,
  TaskFile,
  TaskStatus,
  UpdateTaskInput,
} from "./types.js";
export type {
  FigmaCidDescriptor,
  FigmaCidPreprocessorOptions,
} from "./preprocess/cidPreprocessor.js";
export type { FigmaLinkVitePluginOptions } from "./vite/index.js";
