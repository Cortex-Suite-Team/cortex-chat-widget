export const authStyles = `
.cortex-widget__auth-gate {
  display: none;
  flex-direction: column;
  gap: 10px;
  padding: 14px 12px 12px;
  border-top: 1px solid var(--cortex-border-color);
  background: color-mix(in srgb, var(--cortex-composer-bg) 92%, #ffffff 8%);
  flex: 0 0 auto;
}

.cortex-widget__auth-gate[data-visible="true"] {
  display: flex;
}

.cortex-widget__composer[hidden] {
  display: none !important;
}

.cortex-widget__auth-message {
  margin: 0;
  font-size: 0.875rem;
  color: var(--cortex-subtle-text);
}

.cortex-widget__auth-gate[data-state="denied"] .cortex-widget__auth-message {
  color: #ef4444;
}

.cortex-widget__auth-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cortex-widget__auth-login,
.cortex-widget__auth-password {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--cortex-border-color);
  border-radius: 8px;
  font: inherit;
  font-size: 0.875rem;
  background: var(--cortex-control-bg);
  color: var(--cortex-text-color);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.cortex-widget__auth-login:focus,
.cortex-widget__auth-password:focus {
  border-color: var(--cortex-accent-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cortex-accent-color) 20%, transparent);
}

.cortex-widget__auth-login:disabled,
.cortex-widget__auth-password:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cortex-widget__auth-submit {
  align-self: flex-end;
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--cortex-accent-color), color-mix(in srgb, var(--cortex-accent-color) 52%, #0f172a 48%));
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
}

.cortex-widget__auth-submit:hover:not(:disabled) {
  opacity: 0.9;
}

.cortex-widget__auth-submit:active:not(:disabled) {
  transform: scale(0.97);
}

.cortex-widget__auth-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
`;
