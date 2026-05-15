export const typographyStyles = `
.cortex-widget__title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-widget__subtitle {
  margin: 0;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.2;
  color: var(--cortex-subtle-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-widget__status {
  margin: 0;
  min-width: 0;
  font-size: 10.5px;
  line-height: 1.25;
  color: var(--cortex-muted-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cortex-widget__avatar {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.cortex-widget__empty {
  color: var(--cortex-muted-text);
  font-size: 13px;
  text-align: center;
  padding: 28px 16px;
}

.cortex-widget__bubble {
  font-size: 13px;
  line-height: 1.55;
}

.cortex-widget__bubble-text {
  text-wrap: pretty;
}

.cortex-widget__bubble-text:not(.cortex-widget__markdown) {
  white-space: pre-wrap;
}

.cortex-widget__bubble-text.cortex-widget__markdown {
  white-space: normal;
  line-height: 1.35;
}

.cortex-widget__bubble-text.cortex-widget__markdown > :first-child {
  margin-top: 0;
}

.cortex-widget__bubble-text.cortex-widget__markdown > :last-child {
  margin-bottom: 0;
}

.cortex-widget__bubble-text.cortex-widget__markdown p {
  margin: 0 0 0.45em;
}

.cortex-widget__bubble-text.cortex-widget__markdown h1,
.cortex-widget__bubble-text.cortex-widget__markdown h2,
.cortex-widget__bubble-text.cortex-widget__markdown h3,
.cortex-widget__bubble-text.cortex-widget__markdown h4 {
  margin: 0 0 0.45em;
  font-size: 1em;
  line-height: 1.35;
  font-weight: 700;
}

.cortex-widget__bubble-text.cortex-widget__markdown ul,
.cortex-widget__bubble-text.cortex-widget__markdown ol {
  margin: 0.35em 0 0.45em;
  padding-left: 1.15em;
}

.cortex-widget__bubble-text.cortex-widget__markdown li {
  margin: 0;
  padding-left: 0.05em;
}

.cortex-widget__bubble-text.cortex-widget__markdown li + li {
  margin-top: 0.2em;
}

.cortex-widget__bubble-text.cortex-widget__markdown a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 0.14em;
}

.cortex-widget__bubble-text.cortex-widget__markdown blockquote {
  margin: 0.45em 0;
  padding-left: 0.75em;
  border-left: 2px solid currentColor;
  opacity: 0.85;
}

.cortex-widget__bubble-text.cortex-widget__markdown code,
.cortex-widget__bubble-text.cortex-widget__markdown pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.cortex-widget__bubble-text.cortex-widget__markdown code {
  font-size: 0.92em;
  padding: 0.1em 0.32em;
  border-radius: 0.35rem;
  background: color-mix(in srgb, var(--cortex-text-color) 8%, transparent);
}

.cortex-widget__bubble-text.cortex-widget__markdown pre {
  margin: 0.45em 0;
  white-space: pre-wrap;
  padding: 0.55em 0.7em;
  border-radius: 0.8rem;
  overflow-x: auto;
  background: color-mix(in srgb, var(--cortex-text-color) 6%, transparent);
}

.cortex-widget__bubble-text.cortex-widget__markdown pre code {
  font-size: 0.9em;
  padding: 0;
  border-radius: 0;
  background: transparent;
}

.cortex-widget__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--cortex-muted-text);
}

.cortex-widget__meta-text {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.cortex-widget__meta-text[data-provisional="true"] {
  opacity: 0.68;
}

.cortex-widget__formatted {
  margin: 0;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.5;
  font-family: Consolas, "Courier New", monospace;
}

.cortex-widget__message-attachments {
  list-style: none;
  margin-bottom: 0;
  padding: 0;
}

.cortex-widget__message-attachment {
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
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

.cortex-widget__actor {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

.cortex-widget__actor-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.cortex-widget__actor-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.cortex-widget__actor-name {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--cortex-subtle-text);
}

.cortex-widget__actor-title {
  font-size: 10px;
  color: var(--cortex-muted-text);
}

.cortex-widget__error,
.cortex-widget__worker-status,
.cortex-widget__typing,
.cortex-widget__escalation,
.cortex-widget__textarea,
.cortex-widget__question-option,
.cortex-widget__file-chip,
.cortex-widget__file-remove,
.cortex-widget__attach,
.cortex-widget__send,
.cortex-widget__launcher {
  font: inherit;
}

.cortex-widget__textarea {
  resize: none;
  padding: 8px 12px;
  border-radius: 18px;
  border: 1px solid var(--cortex-border-color);
  outline: none;
  overflow-y: auto;
  background: var(--cortex-background-color);
  color: var(--cortex-text-color);
  font-size: 13px;
  line-height: 1.5;
}

.cortex-widget__textarea::placeholder {
  color: var(--cortex-muted-text);
}

.cortex-widget__textarea:focus {
  border-color: color-mix(in srgb, var(--cortex-accent-color) 56%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--cortex-accent-color) 14%, transparent);
}

.cortex-widget__textarea:disabled {
  background: color-mix(in srgb, var(--cortex-background-color) 86%, #e2e8f0 14%);
  color: var(--cortex-muted-text);
}

.cortex-widget__attach {
  background: var(--cortex-control-bg);
  color: var(--cortex-subtle-text);
}

.cortex-widget__attach:hover:not(:disabled) {
  background: color-mix(in srgb, var(--cortex-control-bg) 72%, #cbd5e1 28%);
}

.cortex-widget__send {
  background: linear-gradient(135deg, var(--cortex-accent-color), color-mix(in srgb, var(--cortex-accent-color) 78%, #0f172a 22%));
  color: #ffffff;
}

.cortex-widget__send:hover:not(:disabled) {
  opacity: 0.9;
}

.cortex-widget__attach:disabled,
.cortex-widget__send:disabled,
.cortex-widget__file-remove:disabled,
.cortex-widget__launcher:disabled,
.cortex-widget__question-option:disabled {
  cursor: not-allowed;
  opacity: 0.42;
  pointer-events: none;
}

.cortex-widget__attach svg,
.cortex-widget__send svg {
  width: 16px;
  height: 16px;
  pointer-events: none;
}

.cortex-widget__file-hint {
  display: block;
  font-size: 11px;
  color: var(--cortex-muted-text);
}

.cortex-widget__file-chip {
  border: 1px solid var(--cortex-border-color);
  background: color-mix(in srgb, var(--cortex-background-color) 84%, #eef2ff 16%);
}

.cortex-widget__file-chip-name {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-widget__file-chip-meta {
  display: block;
  font-size: 11px;
  color: var(--cortex-muted-text);
}

.cortex-widget__file-remove {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--cortex-subtle-text);
  cursor: pointer;
}

.cortex-widget__question-option {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--cortex-accent-color) 36%, transparent);
  background: color-mix(in srgb, var(--cortex-accent-color) 9%, var(--cortex-background-color) 91%);
  color: var(--cortex-accent-color);
  font-size: 12px;
  cursor: pointer;
}

.cortex-widget__question-option:hover:not(:disabled) {
  background: color-mix(in srgb, var(--cortex-accent-color) 15%, var(--cortex-background-color) 85%);
}

.cortex-widget__message-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--cortex-muted-text);
}

.cortex-widget__message-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.cortex-widget__message-status-icon svg {
  width: 13px;
  height: 13px;
  pointer-events: none;
}

.cortex-widget__message-status[data-status="failed"] {
  color: #dc2626;
}

.cortex-widget__message-status[data-status="sending"] {
  opacity: 0.72;
}

.cortex-widget__message-status[data-status="sent"],
.cortex-widget__message-status[data-status="delivered"] {
  color: var(--cortex-muted-text);
}

.cortex-widget__message-status[data-status="processed"] {
  color: color-mix(in srgb, var(--cortex-accent-color) 72%, #38bdf8 28%);
}

.cortex-widget__message-retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.cortex-widget__message-retry:hover {
  background: rgba(220, 38, 38, 0.1);
}

.cortex-widget__message-retry svg {
  width: 12px;
  height: 12px;
  pointer-events: none;
}
`;
