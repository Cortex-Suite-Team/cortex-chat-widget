# Cortex Chat Widget

`@cortex-suite/chat-widget` is a ready-to-use embeddable web chat widget for Cortex Digital Workers.

It builds on:

- `@cortex-suite/sdk` for transport and upload capability
- `@cortex-suite/sdk-ui` for transcript, partial aggregation, input lock, and escalation state

This package is not the Control Plane operator cockpit.

## What This Package Is

- a production-ready chat widget for websites and web apps
- an embeddable UI with Shadow DOM style isolation
- a convenience layer for quick Cortex chat installation

## What This Package Is Not

- not a custom transport implementation
- not a transcript store replacement
- not a Control Plane operator console
- not a React/Vue/Svelte dependency

## Install

```bash
npm install @cortex-suite/chat-widget
```

### Human Assistance capability gate (S22)

The separate Human Assistance cards require the native SDK responder API from
`Cortex-Suite-Team/cortex-sdk` at `6b523a2c705225d9ffa22f845a1dbfc7198de4d6`
and `createHumanAssistanceController` from `Cortex-Suite-Team/cortex-sdk-ui` at
`ce1e84c889f95df46075b1b60fef43628ccd3c68`. The currently pinned npm
versions (`@cortex-suite/sdk@1.1.21` and `@cortex-suite/sdk-ui@0.1.0`) share
their version numbers with older builds and do not prove those APIs are present.
Build both accepted commits into local tarballs and install them together before
building the widget. If either API is absent, the widget shows no HA cards and
does not create a local responder. Ordinary chat remains available. Publishing
those dependency builds and validating the real deployed widget are separate
release gates.

## Embedded Example

```ts
import { mountCortexChat } from '@cortex-suite/chat-widget';

mountCortexChat('#cortex-chat', {
  apiKey: 'your-api-key',
  mode: 'embedded',
});
```

## Floating Example

```ts
import { mountCortexChat } from '@cortex-suite/chat-widget';

const widget = mountCortexChat({
  apiKey: 'your-api-key',
  mode: 'floating',
  position: 'bottom-right',
});

widget.open();
```

## Loader Example

```html
<script
  src="https://cdn.cortexsuite.app/chat-widget/v1/loader.js"
  data-api-key="your-api-key"
  data-mode="floating"
  data-title="Ask Cortex"
  data-position="bottom-right">
</script>
```

The MVP loader auto-mounts immediately when the script is loaded.

## Theme Example

```ts
mountCortexChat({
  apiKey: 'your-api-key',
  mode: 'floating',
  theme: {
    accentColor: '#0f766e',
    backgroundColor: '#ffffff',
    textColor: '#172033',
    borderRadius: '20px',
  },
});
```

## Files

The widget attaches up to 8 files to one message when the active client exposes the canonical `uploadFile()` API. Each selected file gets its own chip with upload status, retry and removal. Files are uploaded one by one in selection order; a successful upload keeps its `sf_...` reference, so retrying a failed upload or a failed send never uploads that file again. The message is sent only when every selected file is uploaded, with the references in selection order.

Uploads return an opaque session file reference (`sf_...`). The widget does not accept or expose legacy/internal File Layer identifiers. If the client does not support uploads, the widget disables attachment UI up front instead of failing later.

Files generated for an assistant answer are read only from the public descriptors in `message.meta.attachments` supplied by `@cortex-suite/sdk-ui` (owner `assistant`, direction `outbound`, bound to the answer's turn). Each one is rendered as its own labeled card and downloaded through `client.downloadFile(file_ref)`; the resulting Blob is saved under a sanitized filename. The widget never derives a download URL from message metadata. Expired, deleted or quarantined files cannot be downloaded, and downloads are disabled in the read-only history view.

## Interactive Questions

The widget renders canonical `chat::question` payloads from `payload.meta.questions`.

```json
{
  "type": "chat::question",
  "payload": {
    "content": "Please clarify",
    "role": "assistant",
    "meta": {
      "question_ref": "q_01hzk8p5x4w6",
      "input_type": "form",
      "allow_reply": true,
      "questions": [
        {
          "key": "decision",
          "label": "Decision",
          "type": "select",
          "required": true,
          "options": [
            { "id": "approve", "label": "Approve" }
          ]
        }
      ]
    }
  }
}
```

Rules:

- `payload.meta.questions` is canonical
- top-level `payload.meta.options` is not supported
- `question_ref` is canonical
- `question_id` is accepted only as an inbound legacy fallback for old `chat::question`
- `resume_event_ref` is internal runtime coordination metadata and is never exposed by the widget

The widget sends answers back as `chat::message` and always includes `payload.meta.question_ref`.

Single select / radio answers use `selected_option`; form or multi-question answers use `answers`.

## Destroy / Unmount Example

```ts
const widget = mountCortexChat({
  apiKey: 'your-api-key',
  mode: 'floating',
});

widget.destroy();
```

## Relationship To Other Packages

- `@cortex-suite/sdk` owns transport, connection lifecycle, and uploads
- `@cortex-suite/sdk-ui` owns normalized transcript state, browser-local transcript persistence, and escalation behavior
- `@cortex-suite/chat-widget` owns DOM, styling, and embeddable UX

This package is not the Control Plane operator cockpit.

## Local Development

Run development commands from the repository root. Do not rely on machine-specific checkout paths.

The published package uses the exact versioned dependency `@cortex-suite/sdk-ui@0.1.0`.
After that version is available from the configured npm registry, use the standard workflow:

```bash
npm ci
npm run build
python -m http.server 8080
```

Before release, set `CORTEX_SDK_UI_TARBALL` to a packed `sdk-ui` artifact and install it without
changing `package.json`:

```bash
npm install --no-save "$CORTEX_SDK_UI_TARBALL"
npm run build
```
