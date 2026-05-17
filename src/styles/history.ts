export const historyStyles = `
.cortex-widget-history {
  --cortex-accent-color: #2563eb;
  --cortex-background-color: #0f172a;
  --cortex-surface-color: #111827;
  --cortex-border-color: rgba(148, 163, 184, 0.2);
  --cortex-muted-text: rgba(226, 232, 240, 0.64);
  --cortex-text-color: #e5eefb;
  display: block;
  height: 100%;
  min-height: 0;
  color: var(--cortex-text-color);
  line-height: 1.4;
}

.cortex-widget-history__panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 8px;
}

.cortex-widget-history__header {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.cortex-widget-history__status {
  min-height: 18px;
  font-size: 12px;
  color: var(--cortex-muted-text);
}

.cortex-widget-history__search {
  border: 1px dashed rgba(226, 232, 240, 0.18);
  border-radius: 10px;
  padding: 8px 10px;
  color: var(--cortex-muted-text);
  font-size: 13px;
}

.cortex-widget-history__new-chat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--cortex-accent-color), color-mix(in srgb, var(--cortex-accent-color) 78%, #0f172a 22%));
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  padding: 8px 12px;
  cursor: pointer;
}

.cortex-widget-history__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, #ffffff 28%, transparent) transparent;
}

.cortex-widget-history__list::-webkit-scrollbar {
  width: 8px;
}

.cortex-widget-history__list::-webkit-scrollbar-track {
  background: transparent;
}

.cortex-widget-history__list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, #ffffff 24%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.cortex-widget-history__list::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, #ffffff 38%, transparent);
  background-clip: content-box;
}

.cortex-widget-history__empty,
.cortex-widget-history__error {
  border-radius: 14px;
  padding: 14px;
  font-size: 13px;
  text-align: center;
}

.cortex-widget-history__empty {
  color: var(--cortex-muted-text);
  background: rgba(255, 255, 255, 0.05);
}

.cortex-widget-history__error {
  color: #9f1239;
  background: color-mix(in srgb, #fff1f2 88%, var(--cortex-background-color) 12%);
  border: 1px solid color-mix(in srgb, #e11d48 22%, transparent);
}

.cortex-widget-history__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.cortex-widget-history__row:hover {
  background: color-mix(in srgb, #ffffff 7%, transparent);
}

.cortex-widget-history__row[data-active="true"] {
  border-color: color-mix(in srgb, var(--cortex-accent-color) 38%, transparent);
  background: color-mix(in srgb, var(--cortex-accent-color) 18%, transparent);
}

.cortex-widget-history__row[data-pinned="true"] {
  color: color-mix(in srgb, #ffffff 92%, var(--cortex-accent-color) 8%);
}

.cortex-widget-history__row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-widget-history__row-pin {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--cortex-accent-color);
  opacity: 0.9;
}

.cortex-widget-history__row-pin:empty {
  display: none;
}

.cortex-widget-history__row-pin svg {
  width: 14px;
  height: 14px;
}

.cortex-widget-history__menu-toggle {
  margin-left: auto;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--cortex-muted-text);
  cursor: pointer;
  opacity: 0;
}

.cortex-widget-history__row:hover .cortex-widget-history__menu-toggle,
.cortex-widget-history__row[data-menu-open="true"] .cortex-widget-history__menu-toggle {
  opacity: 1;
}

.cortex-widget-history__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 10px;
  z-index: 2;
  min-width: 140px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--cortex-border-color);
  background: #111827;
  box-shadow: var(--cortex-shadow-md);
  display: none;
  flex-direction: column;
  gap: 2px;
}

.cortex-widget-history__row[data-menu-open="true"] .cortex-widget-history__menu {
  display: flex;
}

.cortex-widget-history__menu-action {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 6px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cortex-widget-history__menu-action-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--cortex-muted-text);
}

.cortex-widget-history__menu-action-label {
  min-width: 0;
}

.cortex-widget-history__menu-action:hover {
  background: color-mix(in srgb, var(--cortex-background-color) 80%, #e2e8f0 20%);
}
`;
