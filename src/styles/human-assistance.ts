export const humanAssistanceStyles = `
.cortex-widget__human-assistance {
  flex: 0 1 auto;
  max-height: 45%;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 14px;
  border-top: 1px solid var(--cortex-border-color);
}
.cortex-widget__human-assistance[hidden] { display: none; }
.cortex-widget__ha-card {
  padding: 10px;
  margin: 0 0 8px;
  border: 1px solid var(--cortex-border-color);
  border-radius: 10px;
  background: var(--cortex-background-color);
  color: var(--cortex-text-color);
}
.cortex-widget__ha-heading { margin: 0 0 4px; font-size: 13px; }
.cortex-widget__ha-prompt { margin: 0 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.cortex-widget__ha-label { display: block; margin: 8px 0; font-size: 12px; }
.cortex-widget__ha-select, .cortex-widget__ha-text {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 7px;
  border: 1px solid var(--cortex-border-color);
  border-radius: 6px;
  background: var(--cortex-surface-color);
  color: var(--cortex-text-color);
  font: inherit;
}
.cortex-widget__ha-text { min-height: 56px; resize: vertical; }
.cortex-widget__ha-status { margin: 8px 0 0; font-size: 12px; }
.cortex-widget__ha-error { margin: 4px 0 0; color: #b91c1c; font-size: 12px; }
.cortex-widget__ha-error[hidden] { display: none; }
.cortex-widget__ha-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.cortex-widget__ha-button {
  padding: 6px 10px;
  border: 1px solid var(--cortex-border-color);
  border-radius: 6px;
  background: var(--cortex-surface-color);
  color: var(--cortex-text-color);
  cursor: pointer;
  font: inherit;
}
.cortex-widget__ha-button:disabled { opacity: .5; cursor: default; }
.cortex-widget__ha-button[hidden] { display: none; }
`;
