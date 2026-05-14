# Examples for `@cortex-suite/chat-widget`

This directory contains both:

- `/example/` for the standalone mock browser demo
- `/example/real-runtime.html` for the live Control Plane auth -> SessionManager WebSocket smoke path

The mock page uses:

- the GitHub-hosted widget bundle from the `cortex-chat-widget` repository
- the GitHub-hosted mock `client` from the same repository

It does not require:

- a real Runtime
- Control Plane
- a real API key
- a released Digital Worker

## Run it

## Mock page

Build the package if you want fresh local artifacts and tests, but the mock example page itself imports its runtime files from GitHub:

```bash
npm run build
```

Serve the package directory with any static server, for example:

```bash
python -m http.server 8080
```

Or:

```bash
npx http-server .
```

Then open:

```text
/example/
```

## What the mock does

- simulates backend echo for the user message
- simulates typing start / stop events
- emits one or more `chat::partial` messages
- emits a final `chat::answer`
- returns mock attachment ids from `uploadAttachment()`

Everything runs in the browser with GitHub-hosted module files. No real backend connection is required.

## Real runtime page

`real-runtime.html` is different. It imports the local built widget bundle from `../dist/index.js`, so rebuild before serving it:

```bash
npm run real-runtime:prepare
```

Then serve the package directory and open:

```text
/example/real-runtime.html
```

The page also reads `../dist/build-info.json` and prints the exact bundle metadata, including the resolved `@cortex-suite/sdk` version used at build time, so stale or missing local `dist` is visible instead of silent.

This live smoke intentionally uses a tenant API key plus `workerRef`. In that flow the runtime
session identity is expected to resolve as `actor_kind=tenant_api_key_user`. `public_widget_user`
applies only when `/auth/token` is called with a `PublicWidgetKey`.
