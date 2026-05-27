export const layoutStyles = `
.cortex-widget *,
.cortex-widget *::before,
.cortex-widget *::after,
.cortex-widget-history,
.cortex-widget-history *,
.cortex-widget-history *::before,
.cortex-widget-history *::after {
  box-sizing: border-box;
}

.cortex-widget {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  line-height: 1.4;
}

.cortex-widget[data-mode="embedded"] {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.cortex-widget[data-mode="floating"] {
  position: fixed;
  bottom: 20px;
  z-index: 2147483000;
}

.cortex-widget[data-position="bottom-right"] {
  right: 20px;
}

.cortex-widget[data-position="bottom-left"] {
  left: 20px;
}

.cortex-widget__launcher {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  height: 56px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--cortex-accent-color), color-mix(in srgb, var(--cortex-accent-color) 52%, #0f172a 48%));
  color: #ffffff;
  box-shadow: var(--cortex-shadow-md);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  padding: 0 18px;
}

.cortex-widget__panel {
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden;
  gap: 0;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid var(--cortex-border-color);
  background: var(--cortex-surface-color);
  box-shadow: var(--cortex-shadow-lg);
  container-type: inline-size;
}

.cortex-widget-shell {
  --cortex-shell-nav-bg: color-mix(in srgb, #0f172a 88%, var(--cortex-accent-color) 12%);
  --cortex-shell-chat-bg: linear-gradient(180deg, color-mix(in srgb, var(--cortex-background-color) 97%, #ffffff 3%), var(--cortex-surface-color));
}

.cortex-widget-shell__rail {
  flex: 0 0 10px;
  min-width: 10px;
  border-radius: 6px 0 0 6px;
  background: var(--cortex-shell-chat-bg);
}

.cortex-widget-shell__history {
  min-width: 0;
  overflow: hidden;
}

.cortex-widget-shell[data-has-history="false"] .cortex-widget-shell__history {
  flex: 0 0 0;
  width: 0;
  min-width: 0;
  max-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}

.cortex-widget-shell[data-has-history="true"] .cortex-widget-shell__rail,
.cortex-widget-shell[data-has-history="true"] .cortex-widget-shell__history {
  background: var(--cortex-shell-nav-bg);
}

.cortex-widget-shell[data-has-history="true"] .cortex-widget-shell__history {
  flex: 0 0 clamp(236px, 30%, 340px);
}

.cortex-widget-shell__chat {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 0 6px 6px 0;
  background: var(--cortex-shell-chat-bg);
}

.cortex-widget[data-mode="embedded"] .cortex-widget__panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100%;
}

.cortex-widget[data-mode="floating"] .cortex-widget__panel {
  width: min(400px, calc(100vw - 24px));
  height: min(680px, calc(100vh - 96px));
  margin-bottom: 12px;
}

.cortex-widget__panel[hidden] {
  display: none;
}

.cortex-widget__header {
  flex: 0 0 auto;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--cortex-border-color);
  background: color-mix(in srgb, var(--cortex-background-color) 92%, #ffffff 8%);
  backdrop-filter: blur(12px);
}

.cortex-widget__header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.cortex-widget__avatar {
  width: 38px;
  height: 38px;
  min-width: 38px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--cortex-avatar-bg);
  color: var(--cortex-avatar-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #ffffff 12%, transparent);
}

.cortex-widget__avatar img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
  display: block;
}

.cortex-widget__header-text {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cortex-widget__status-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.cortex-widget__status-dot {
  width: 7px;
  height: 7px;
  min-width: 7px;
  border-radius: 999px;
  background: var(--cortex-status-idle);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cortex-background-color) 92%, transparent);
}

.cortex-widget__status-dot[data-state="online"] {
  background: var(--cortex-status-online);
}

.cortex-widget__status-dot[data-state="active"] {
  background: var(--cortex-status-active);
}

.cortex-widget__status-dot[data-state="history"] {
  background: var(--cortex-status-history);
}

.cortex-widget__body {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cortex-widget__error {
  display: none;
  margin: 10px 14px 0;
  padding: 9px 12px;
  border-radius: 12px;
}

.cortex-widget__error[data-visible="true"] {
  display: block;
}

.cortex-widget__transcript {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cortex-widget__message {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cortex-widget__message[data-role="user"] {
  align-items: flex-end;
}

.cortex-widget__message[data-role="assistant"],
.cortex-widget__message[data-role="system"],
.cortex-widget__message[data-role="error"],
.cortex-widget__message[data-role="operator"],
.cortex-widget__message[data-role="escalation"] {
  align-items: flex-start;
}

.cortex-widget__bubble {
  max-width: min(82%, 560px);
  padding: 9px 12px;
  border-radius: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}

.cortex-widget__bubble.cortex-widget__bubble--markdown {
  white-space: normal;
}

.cortex-widget__message[data-role="assistant"] .cortex-widget__bubble,
.cortex-widget__message[data-role="system"] .cortex-widget__bubble,
.cortex-widget__message[data-role="operator"] .cortex-widget__bubble {
  border-bottom-left-radius: 4px;
}

.cortex-widget__message[data-role="user"] .cortex-widget__bubble {
  border-bottom-right-radius: 4px;
}

.cortex-widget__meta,
.cortex-widget__message-status {
  padding: 0 4px;
}

.cortex-widget__worker-status,
.cortex-widget__typing,
.cortex-widget__escalation {
  display: none;
  margin: 0 14px 10px;
  padding: 8px 12px;
  border-radius: 12px;
}

.cortex-widget__worker-status[data-visible="true"],
.cortex-widget__typing[data-visible="true"],
.cortex-widget__escalation[data-visible="true"] {
  display: block;
}

.cortex-widget__composer {
  flex: 0 0 auto;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--cortex-border-color);
  background: color-mix(in srgb, var(--cortex-composer-bg) 92%, #ffffff 8%);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cortex-widget__composer-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.cortex-widget__textarea {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 38px;
  max-height: 112px;
  overflow-y: hidden;
  resize: none;
}

.cortex-widget__actions {
  min-height: 14px;
}

.cortex-widget__attach-wrap {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.cortex-widget__attach,
.cortex-widget__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s ease, transform 0.1s ease, background-color 0.15s ease;
}

.cortex-widget__attach:active:not(:disabled),
.cortex-widget__send:active:not(:disabled) {
  transform: scale(0.94);
}

.cortex-widget__file-input {
  display: none;
}

.cortex-widget__file-chip {
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 14px;
}

.cortex-widget__file-chip[data-visible="true"] {
  display: flex;
}

.cortex-widget__file-chip-main {
  min-width: 0;
}

.cortex-widget__question-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.cortex-widget__message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.cortex-widget__question-form {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.cortex-widget__question-field {
  display: grid;
  gap: 5px;
}

@container (max-width: 339px) {
  .cortex-widget__header {
    padding: 12px 12px 10px;
  }

  .cortex-widget__transcript {
    padding: 12px 10px 8px;
  }

  .cortex-widget__bubble {
    max-width: 92%;
    padding: 8px 10px;
  }

  .cortex-widget__composer {
    padding: 9px 10px 10px;
  }

  .cortex-widget__composer-row {
    gap: 6px;
  }

  .cortex-widget__avatar {
    width: 34px;
    height: 34px;
    min-width: 34px;
  }
}

@container (min-width: 560px) {
  .cortex-widget__header {
    padding: 16px 18px 12px;
  }

  .cortex-widget__transcript {
    padding: 16px 18px 12px;
  }

  .cortex-widget__bubble {
    max-width: min(74%, 620px);
  }

  .cortex-widget__composer {
    padding: 12px 16px 14px;
  }
}

@media (max-width: 520px) {
  .cortex-widget[data-mode="floating"] {
    left: 12px;
    right: 12px;
    bottom: 12px;
  }

  .cortex-widget[data-mode="floating"][data-position="bottom-left"],
  .cortex-widget[data-mode="floating"][data-position="bottom-right"] {
    left: 12px;
    right: 12px;
  }

  .cortex-widget[data-mode="floating"] .cortex-widget__panel {
    width: 100%;
    height: min(74vh, 640px);
  }

  .cortex-widget__launcher {
    width: 100%;
  }
}
`;
