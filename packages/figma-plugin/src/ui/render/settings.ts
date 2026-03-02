import type { AppState } from "../state/store";

export function renderSettingsView(state: AppState): string {
  const treeEnabled = state.settings.generateLayerTree;

  return `
    <div class="settings-view">
      <div class="settings-section">
        <div class="settings-section__title">Dev Features</div>
        <div class="settings-row">
          <div class="settings-row__label">
            <div class="settings-row__name">Generate Layer Tree</div>
            <div class="settings-row__desc">
              Captures a compact layout tree from Figma and stores it on the
              entry. Provides Copilot with nesting, flex structure, and design
              token context — without a separate MCP call.
            </div>
          </div>
          <button
            class="toggle ${treeEnabled ? "toggle--on" : ""}"
            data-action="settings-toggle-tree"
            aria-pressed="${treeEnabled}"
          >
            <span class="toggle__knob"></span>
          </button>
        </div>
      </div>
    </div>
  `;
}
