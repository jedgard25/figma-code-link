declare module "*.svelte" {
  import type { SvelteComponent } from "svelte";

  export default class Component extends SvelteComponent<
    Record<string, any>,
    Record<string, any>,
    Record<string, any>
  > {}
}
