export const themeStyles = `
:host {
  color-scheme: light;
}

.cortex-widget,
.cortex-widget-history {
  --cortex-accent-color: #2563eb;
  --cortex-background-color: #ffffff;
  --cortex-text-color: #172033;
  --cortex-border-radius: 18px;
  --cortex-surface-color: color-mix(in srgb, var(--cortex-background-color) 94%, #ffffff 6%);
  --cortex-surface-muted: color-mix(in srgb, var(--cortex-background-color) 82%, #eef2ff 18%);
  --cortex-border-color: color-mix(in srgb, var(--cortex-text-color) 12%, transparent);
  --cortex-subtle-text: color-mix(in srgb, var(--cortex-text-color) 68%, transparent);
  --cortex-muted-text: color-mix(in srgb, var(--cortex-text-color) 48%, transparent);
  --cortex-bubble-in-bg: color-mix(in srgb, var(--cortex-background-color) 88%, #e9eef8 12%);
  --cortex-bubble-in-border: color-mix(in srgb, var(--cortex-text-color) 10%, transparent);
  --cortex-bubble-out-bg: var(--cortex-accent-color);
  --cortex-bubble-out-text: #ffffff;
  --cortex-avatar-bg: color-mix(in srgb, var(--cortex-accent-color) 86%, #0f172a 14%);
  --cortex-avatar-text: #ffffff;
  --cortex-composer-bg: color-mix(in srgb, var(--cortex-background-color) 97%, #ffffff 3%);
  --cortex-control-bg: color-mix(in srgb, var(--cortex-background-color) 90%, #eff4fb 10%);
  --cortex-shadow-lg: 0 24px 60px rgba(15, 23, 42, 0.18);
  --cortex-shadow-md: 0 12px 28px rgba(15, 23, 42, 0.08);
  --cortex-status-online: #22c55e;
  --cortex-status-active: color-mix(in srgb, var(--cortex-accent-color) 74%, #34d399 26%);
  --cortex-status-idle: color-mix(in srgb, var(--cortex-text-color) 22%, transparent);
  --cortex-status-history: #f59e0b;
  color: var(--cortex-text-color);
  font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.cortex-widget--dark,
.cortex-widget-history--dark {
  --cortex-surface-color: color-mix(in srgb, var(--cortex-background-color) 92%, #111827 8%);
  --cortex-surface-muted: color-mix(in srgb, var(--cortex-background-color) 82%, #0f172a 18%);
  --cortex-border-color: color-mix(in srgb, #ffffff 10%, transparent);
  --cortex-subtle-text: color-mix(in srgb, #ffffff 74%, transparent);
  --cortex-muted-text: color-mix(in srgb, #ffffff 54%, transparent);
  --cortex-bubble-in-bg: color-mix(in srgb, var(--cortex-background-color) 80%, #1e293b 20%);
  --cortex-bubble-in-border: color-mix(in srgb, #ffffff 7%, transparent);
  --cortex-control-bg: color-mix(in srgb, var(--cortex-background-color) 78%, #1e293b 22%);
  --cortex-shadow-lg: 0 24px 60px rgba(2, 6, 23, 0.45);
  --cortex-shadow-md: 0 14px 30px rgba(2, 6, 23, 0.24);
}
`;
