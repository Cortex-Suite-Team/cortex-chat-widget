export const widgetStyles = `
:host {
  color-scheme: light;
}

.cortex-widget {
  --cortex-accent-color: #2563eb;
  --cortex-background-color: #ffffff;
  --cortex-text-color: #172033;
  --cortex-border-radius: 18px;
  color: var(--cortex-text-color);
  font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
  line-height: 1.4;
}

.cortex-widget *,
.cortex-widget *::before,
.cortex-widget *::after {
  box-sizing: border-box;
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
  background: linear-gradient(135deg, var(--cortex-accent-color), #0f172a);
  color: #ffffff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  padding: 0 18px;
}

.cortex-widget__panel {
  width: min(380px, calc(100vw - 24px));
  height: min(680px, calc(100vh - 96px));
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 38%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.98), var(--cortex-background-color));
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--cortex-border-radius);
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
}

.cortex-widget__panel[hidden] {
  display: none;
}

.cortex-widget[data-mode="floating"] .cortex-widget__panel {
  margin-bottom: 12px;
}

.cortex-widget__header {
  padding: 18px 18px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px);
}

.cortex-widget__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.cortex-widget__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #475569;
}

.cortex-widget__status {
  margin: 8px 0 0;
  font-size: 12px;
  color: #334155;
}

.cortex-widget__body {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.cortex-widget__error {
  display: none;
  margin: 12px 18px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #9f1239;
  font-size: 13px;
}

.cortex-widget__error[data-visible="true"] {
  display: block;
}

.cortex-widget__transcript {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cortex-widget__empty {
  color: #64748b;
  font-size: 13px;
  text-align: center;
  padding: 24px 12px;
}

.cortex-widget__message {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  max-width: 88%;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.92);
  color: var(--cortex-text-color);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  white-space: pre-wrap;
  word-break: break-word;
}

.cortex-widget__bubble-text {
  white-space: pre-wrap;
}

.cortex-widget__message[data-role="user"] .cortex-widget__bubble {
  background: linear-gradient(135deg, var(--cortex-accent-color), #1d4ed8);
  color: #ffffff;
}

.cortex-widget__message[data-role="assistant"] .cortex-widget__bubble[data-status="streaming"]::after {
  content: " ···";
  opacity: 0.75;
}

.cortex-widget__message[data-role="error"] .cortex-widget__bubble {
  border-color: #fecdd3;
  background: #fff1f2;
  color: #9f1239;
}

.cortex-widget__message[data-role="escalation"] .cortex-widget__bubble {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.cortex-widget__meta {
  font-size: 11px;
  color: #64748b;
}

.cortex-widget__formatted {
  margin: 0;
  white-space: pre-wrap;
  font-size: 12px;
  font-family: Consolas, "Courier New", monospace;
}

.cortex-widget__message-attachments {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
}

.cortex-widget__message-attachment {
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  border: 1px solid rgba(148, 163, 184, 0.24);
  font-size: 12px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-widget__message-attachment-link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: inherit;
  text-decoration: none;
}

.cortex-widget__message-attachment-link:hover {
  text-decoration: underline;
}

.cortex-widget__message-attachment-label {
  font-weight: 600;
}

.cortex-widget__message-attachment-details {
  font-size: 11px;
  opacity: 0.82;
}

.cortex-widget__message[data-role="user"] .cortex-widget__message-attachment {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.28);
  color: #ffffff;
}

.cortex-widget__typing,
.cortex-widget__escalation {
  display: none;
  margin: 0 18px 12px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
}

.cortex-widget__typing[data-visible="true"] {
  display: block;
  background: #eff6ff;
  color: #1d4ed8;
}

.cortex-widget__escalation[data-visible="true"] {
  display: block;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

.cortex-widget__composer {
  padding: 14px 18px 18px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.94);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cortex-widget__textarea {
  width: 100%;
  min-height: 92px;
  resize: vertical;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: #ffffff;
  color: var(--cortex-text-color);
  font: inherit;
  outline: none;
}

.cortex-widget__textarea:focus {
  border-color: rgba(37, 99, 235, 0.55);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.cortex-widget__textarea:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

.cortex-widget__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cortex-widget__attach-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cortex-widget__attach,
.cortex-widget__send,
.cortex-widget__file-remove {
  border: 0;
  border-radius: 12px;
  font: inherit;
  cursor: pointer;
}

.cortex-widget__attach,
.cortex-widget__file-remove {
  background: #eff6ff;
  color: #1d4ed8;
  padding: 9px 12px;
}

.cortex-widget__send {
  background: linear-gradient(135deg, var(--cortex-accent-color), #1d4ed8);
  color: #ffffff;
  padding: 10px 16px;
  font-weight: 600;
  min-width: 92px;
}

.cortex-widget__attach:disabled,
.cortex-widget__send:disabled,
.cortex-widget__file-remove:disabled,
.cortex-widget__launcher:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.cortex-widget__file-input {
  display: none;
}

.cortex-widget__file-hint {
  font-size: 12px;
  color: #64748b;
}

.cortex-widget__file-chip {
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.cortex-widget__file-chip[data-visible="true"] {
  display: flex;
}

.cortex-widget__file-chip-main {
  min-width: 0;
}

.cortex-widget__file-chip-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-widget__file-chip-meta {
  display: block;
  font-size: 12px;
  color: #64748b;
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

  .cortex-widget__panel {
    width: 100%;
    height: min(74vh, 640px);
  }

  .cortex-widget__launcher {
    width: 100%;
  }
}
`;
