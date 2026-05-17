export const historyStyles = `
.cortex-widget-history {
  --cortex-accent-color: #2563eb;
  --cortex-background-color: #ffffff;
  --cortex-text-color: #172033;
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
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--cortex-accent-color) 10%, transparent), transparent 40%),
    linear-gradient(180deg, color-mix(in srgb, var(--cortex-background-color) 97%, #ffffff 3%), var(--cortex-surface-color));
  border: 1px solid var(--cortex-border-color);
  border-radius: 18px;
  box-shadow: var(--cortex-shadow-md);
  padding: 16px;
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
  border: 1px dashed var(--cortex-border-color);
  border-radius: 14px;
  padding: 12px 14px;
  color: var(--cortex-muted-text);
  font-size: 13px;
}

.cortex-widget-history__new-chat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--cortex-accent-color), color-mix(in srgb, var(--cortex-accent-color) 78%, #0f172a 22%));
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
}

.cortex-widget-history__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  background: color-mix(in srgb, var(--cortex-background-color) 92%, #ffffff 8%);
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
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: color-mix(in srgb, var(--cortex-background-color) 92%, #ffffff 8%);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.cortex-widget-history__row[data-active="true"] {
  border-color: color-mix(in srgb, var(--cortex-accent-color) 22%, transparent);
  background: color-mix(in srgb, var(--cortex-accent-color) 10%, var(--cortex-background-color) 90%);
}

.cortex-widget-history__row[data-pinned="true"] {
  border-color: color-mix(in srgb, var(--cortex-accent-color) 16%, transparent);
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
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--cortex-border-color);
  background: var(--cortex-background-color);
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
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 8px 10px;
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
