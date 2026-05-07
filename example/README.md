# Mock example for `@cortex-suite/chat-widget`

This example is a standalone mock browser demo for the widget package.

It uses:

- the real built widget bundle from `../dist/index.js`
- a mock `client` from `./mock-client.js`

It does not require:

- a real Runtime
- Control Plane
- a real API key
- a released Digital Worker

## Run it

Build the package first:

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

Everything runs locally in the browser. No real backend connection is required.
