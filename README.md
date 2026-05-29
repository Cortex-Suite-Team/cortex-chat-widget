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

## File Attachment Note

Stage 5 supports one file attachment when the active client exposes `uploadAttachment()` or `uploadFile()`.

If the client does not support uploads, the widget disables attachment UI up front instead of failing later.

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
- `@cortex-suite/sdk-ui` owns chat transcript and escalation behavior
- `@cortex-suite/chat-widget` owns DOM, styling, and embeddable UX

This package is not the Control Plane operator cockpit.


cd D:\GitHub\Cortex\public\cortex-chat-widget
npm run build
python -m http.server 8080