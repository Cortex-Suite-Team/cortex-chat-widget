export const messageStyles = `
.cortex-widget__error {
  background: color-mix(in srgb, #fff1f2 88%, var(--cortex-background-color) 12%);
  border: 1px solid color-mix(in srgb, #e11d48 22%, transparent);
  color: #9f1239;
  font-size: 12px;
}

.cortex-widget__message[data-role="assistant"] .cortex-widget__bubble[data-status="streaming"]::after {
  content: " ···";
  opacity: 0.75;
}

.cortex-widget__message[data-role="assistant"] .cortex-widget__bubble,
.cortex-widget__message[data-role="system"] .cortex-widget__bubble,
.cortex-widget__message[data-role="operator"] .cortex-widget__bubble {
  background: var(--cortex-bubble-in-bg);
  border: 1px solid var(--cortex-bubble-in-border);
  color: var(--cortex-text-color);
}

.cortex-widget__message[data-role="user"] .cortex-widget__bubble {
  background: linear-gradient(135deg, var(--cortex-bubble-out-bg), color-mix(in srgb, var(--cortex-bubble-out-bg) 72%, #0f172a 28%));
  color: var(--cortex-bubble-out-text);
}

.cortex-widget__message[data-role="error"] .cortex-widget__bubble {
  border: 1px solid color-mix(in srgb, #e11d48 20%, transparent);
  background: color-mix(in srgb, #fff1f2 88%, var(--cortex-background-color) 12%);
  color: #9f1239;
}

.cortex-widget__message[data-role="escalation"] .cortex-widget__bubble {
  border: 1px solid color-mix(in srgb, #f59e0b 25%, transparent);
  background: color-mix(in srgb, #fffbeb 88%, var(--cortex-background-color) 12%);
  color: #92400e;
}

.cortex-widget__message-attachment {
  background: color-mix(in srgb, var(--cortex-background-color) 82%, #dfe8f8 18%);
  border: 1px solid var(--cortex-bubble-in-border);
}

.cortex-widget__message[data-role="user"] .cortex-widget__message-attachment {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.cortex-widget__worker-status {
  background: color-mix(in srgb, var(--cortex-background-color) 88%, #eef2ff 12%);
  color: var(--cortex-subtle-text);
  font-size: 12px;
}

.cortex-widget__worker-status[data-state="error"] {
  background: color-mix(in srgb, #fff1f2 88%, var(--cortex-background-color) 12%);
  color: #dc2626;
}

.cortex-widget__typing {
  background: color-mix(in srgb, var(--cortex-background-color) 88%, #eff6ff 12%);
  color: color-mix(in srgb, var(--cortex-accent-color) 84%, #1d4ed8 16%);
  font-size: 12px;
}

.cortex-widget__escalation {
  background: color-mix(in srgb, #fffbeb 88%, var(--cortex-background-color) 12%);
  border: 1px solid color-mix(in srgb, #f59e0b 22%, transparent);
  color: #92400e;
  font-size: 12px;
}
`;
