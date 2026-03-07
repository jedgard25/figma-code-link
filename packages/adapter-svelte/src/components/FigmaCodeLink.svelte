<script lang="ts">
  import DomReviewOverlay from "./DomReviewOverlay.svelte";

  export let serverUrl = "http://localhost:7842";
  export let enabledByDefault = false;
</script>

<DomReviewOverlay {serverUrl} {enabledByDefault} />