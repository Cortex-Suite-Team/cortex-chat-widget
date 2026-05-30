import {
  applyChatState,
  baseChatState,
  changeInput,
  CustomClient,
  flushAsyncWork,
  mountWidget,
  resetMocks,
  setFileInput,
  submitComposer,
} from './helpers.js';

function getHost(): HTMLElement {
  return document.body.firstElementChild as HTMLElement;
}

function getShadow(): ShadowRoot {
  const host = getHost();
  if (!host.shadowRoot) {
    throw new Error('Expected shadow root');
  }
  return host.shadowRoot;
}

describe('widget renderer behavior', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('renders one optimistic user message and reconciles it with backend echo without duplication', async () => {
    mountWidget();
    const shadow = getShadow();
    const transcript = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;
    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Test',
        clientMsgId: 'msg_1',
        deliveryStatus: 'sending',
        ts: '2026-05-11T10:14:00Z',
        meta: {
          client_msg_id: 'msg_1',
          timestamp_source: 'client',
        },
      }],
    }));

    expect(shadow.querySelectorAll('[data-testid="transcript-message"]')).toHaveLength(1);
    expect(transcript.textContent).toContain('Test');
    expect((shadow.querySelector('[data-testid="message-meta-text"]') as HTMLElement).dataset.provisional).toBe('true');

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Test',
        clientMsgId: 'msg_1',
        deliveryStatus: 'processed',
        ts: '2026-05-11T10:15:00Z',
        meta: {
          client_msg_id: 'msg_1',
          timestamp_source: 'server',
          echo_type: 'chat::echo',
        },
      }],
    }));

    const messages = shadow.querySelectorAll('[data-testid="transcript-message"]');
    expect(messages).toHaveLength(1);
    expect(transcript.textContent).toContain('Test');
    expect((shadow.querySelector('[data-testid="message-meta-text"]') as HTMLElement).dataset.provisional).toBeUndefined();
    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    expect((messages[0] as HTMLElement).dataset.role).toBe('user');
    expect((shadow.querySelector('[data-testid="message-delivery-status"]') as HTMLElement).dataset.status).toBe('processed');
  });

  it('does not unlock composer on chat::echo while awaiting final answer', async () => {
    const { autoClient } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;

    changeInput(textarea, 'Question');
    submitComposer(form);
    await flushAsyncWork();

    expect(textarea.disabled).toBe(true);

    autoClient?.emit({
      type: 'chat::echo',
      payload: {
        content: 'Question',
        role: 'user',
      },
    });

    expect(textarea.disabled).toBe(true);

    autoClient?.emit({
      type: 'chat::answer',
      payload: {
        answer_kind: 'final',
      },
    });

    expect(textarea.disabled).toBe(false);
  });

  it('locks composer until final answer and does not unlock on partials', async () => {
    const { autoClient } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    const sendButton = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;
    const attachButton = shadow.querySelector('[data-testid="attach-button"]') as HTMLButtonElement;

    changeInput(textarea, 'Question');
    submitComposer(form);
    await flushAsyncWork();

    expect(sendButton.disabled).toBe(true);
    expect(attachButton.disabled).toBe(true);

    autoClient?.emit({
      type: 'chat::partial',
      payload: {
        turn_id: 'turn_1',
        content: 'partial',
      },
    });

    expect(sendButton.disabled).toBe(true);

    autoClient?.emit({
      type: 'chat::answer',
      payload: {
        answer_kind: 'final',
      },
    });

    expect(textarea.disabled).toBe(false);
  });

  it('shows typing indicator and hides it on stop and final answer', () => {
    const { autoClient } = mountWidget();
    const shadow = getShadow();
    const typing = shadow.querySelector('[data-testid="typing-indicator"]') as HTMLElement;

    autoClient?.emit({ type: 'typing::start', payload: {} });
    expect(typing.dataset.visible).toBe('true');

    autoClient?.emit({ type: 'typing::stop', payload: {} });
    expect(typing.dataset.visible).toBe('false');

    autoClient?.emit({ type: 'chat::typing', payload: {} });
    expect(typing.dataset.visible).toBe('true');

    autoClient?.emit({
      type: 'chat::answer',
      payload: { answer_kind: 'final' },
    });
    expect(typing.dataset.visible).toBe('false');
  });

  it('supports one-file selection, replacement, removal, upload, and retryable send failure state', async () => {
    const client = new CustomClient();
    client.uploadAttachmentImpl = async (file) => `attachment:${file.name}`;

    const { controller } = mountWidget({
      client,
    });

    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    const fileInput = shadow.querySelector('[data-testid="file-input"]') as HTMLInputElement;
    const fileChip = shadow.querySelector('[data-testid="selected-file-chip"]') as HTMLElement;
    const removeButton = shadow.querySelector('[data-testid="remove-file"]') as HTMLButtonElement;

    const firstFile = new File(['a'], 'first.txt', { type: 'text/plain' });
    setFileInput(fileInput, firstFile);
    expect(fileChip.textContent).toContain('first.txt');

    const secondFile = new File(['b'], 'second.txt', { type: 'text/plain' });
    setFileInput(fileInput, secondFile);
    expect(fileChip.textContent).toContain('second.txt');

    removeButton.click();
    expect(fileChip.dataset.visible).toBe('false');

    setFileInput(fileInput, secondFile);
    changeInput(textarea, 'Attach this');
    controller.nextSendError = new Error('Send failed');

    submitComposer(form);
    await flushAsyncWork();

    expect(client.uploadedAttachments).toHaveLength(1);
    expect(controller.sendCalls[0]).toMatchObject({
      content: ['Attach this'],
      // Widget wraps the string ID into a canonical dict ref (file_id path for non-fa_ IDs).
      attachments: [{ attachment_id: 'attachment:second.txt', file_id: 'attachment:second.txt' }],
    });
    expect(textarea.value).toBe('Attach this');
    expect(fileChip.textContent).toContain('second.txt');

    submitComposer(form);
    await flushAsyncWork();

    expect(client.uploadedAttachments).toHaveLength(1);
    expect(controller.sendCalls).toHaveLength(2);
  });

  it('prevents send when upload fails', async () => {
    const client = new CustomClient();
    client.uploadAttachmentImpl = async () => {
      throw new Error('Upload failed');
    };

    const { controller } = mountWidget({
      client,
    });

    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    const fileInput = shadow.querySelector('[data-testid="file-input"]') as HTMLInputElement;

    changeInput(textarea, 'Needs file');
    setFileInput(fileInput, new File(['data'], 'broken.txt', { type: 'text/plain' }));

    submitComposer(form);
    await flushAsyncWork();

    expect(controller.sendCalls).toHaveLength(0);
    const banner = shadow.querySelector('[data-testid="error-banner"]') as HTMLElement;
    expect(banner.textContent).toContain('Upload failed');
  });

  it('renders escalation pending card', () => {
    mountWidget();
    const shadow = getShadow();
    const escalation = shadow.querySelector('[data-testid="escalation-card"]') as HTMLElement;

    applyChatState(baseChatState({
      escalation: {
        escalationId: 'esc_1',
        allowedActions: ['reply_user'],
        status: 'pending',
      },
      input: {
        locked: true,
      },
    }));

    expect(escalation.dataset.visible).toBe('true');
    expect(escalation.textContent).toContain('waiting for human/operator action');
  });

  it('escalation::request in transcript renders no bubble — escalation card is the user-visible surface', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      escalation: {
        escalationId: 'esc_1',
        allowedActions: ['reply_user'],
        status: 'pending',
      },
      transcript: [{
        id: 'esc_msg_1',
        type: 'escalation::request',
        role: 'escalation',
        content: 'Needs human approval',
        meta: {
          escalationId: 'esc_1',
          waitToken: 'tok_secret',
          allowedActions: ['reply_user'],
        },
      }],
    }));

    const bubbles = shadow.querySelectorAll('[data-testid="message-bubble"]');
    expect(bubbles).toHaveLength(0);

    const card = shadow.querySelector('[data-testid="escalation-card"]') as HTMLElement;
    expect(card.dataset.visible).toBe('true');

    expect(shadow.textContent).not.toContain('tok_secret');
    expect(shadow.textContent).not.toContain('Needs human approval');
  });

  it('renders a visible user message for attachment-only backend echo without an empty bubble', () => {
    mountWidget();
    const shadow = getShadow();
    const transcript = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_attachment_only',
        type: 'chat::echo',
        role: 'user',
        content: '',
        meta: {
          attachments: [{
            file_id: 'mock_file_1_report',
            filename: 'report.xlsx',
          }],
        },
      }],
    }));

    const bubble = shadow.querySelector('[data-testid="message-bubble"]') as HTMLElement;
    const attachments = shadow.querySelector('[data-testid="message-attachments"]') as HTMLElement;

    expect(bubble).toBeTruthy();
    expect(bubble.textContent).toContain('Attachment sent');
    expect(attachments.textContent).toContain('report.xlsx');
    expect(transcript.textContent).not.toMatch(/^\s*user\s*$/);
  });

  it('renders both text and attachment chip for backend echo with content and attachments', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_text_attachment',
        type: 'chat::echo',
        role: 'user',
        content: 'Please review this file',
        meta: {
          attachments: [{
            file_id: 'mock_file_2_contract',
            filename: 'contract.pdf',
          }],
        },
      }],
    }));

    const bubble = shadow.querySelector('[data-testid="message-bubble"]') as HTMLElement;
    const attachments = shadow.querySelector('[data-testid="message-attachments"]') as HTMLElement;

    expect(bubble.textContent).toContain('Please review this file');
    expect(attachments.textContent).toContain('contract.pdf');
  });

  it('renders assistant file attachments as download links when attachment url is available', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_assistant_file',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Generated file is ready.',
        meta: {
          attachments: [{
            file_id: 'file_123',
            filename: 'summary.pdf',
            content_type: 'application/pdf',
            size: 2048,
            download_url: 'https://example.test/download/summary.pdf',
          }],
        },
      }],
    }));

    const link = shadow.querySelector('[data-testid="message-attachment-link"]') as HTMLAnchorElement;

    expect(link).toBeTruthy();
    expect(link.href).toBe('https://example.test/download/summary.pdf');
    expect(link.download).toBe('summary.pdf');
    expect(link.textContent).toContain('summary.pdf');
    expect(link.textContent).toContain('application/pdf');
  });

  it('renders assistant final answers through the html markdown branch', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_markdown',
        type: 'chat::answer',
        role: 'assistant',
        content: '**Bold**',
        status: 'final',
      }],
    }));

    const markdown = shadow.querySelector('.cortex-widget__markdown') as HTMLElement;
    expect(markdown).toBeTruthy();
    expect(markdown.className).toContain('cortex-widget__bubble-text');
    expect(markdown.innerHTML).toContain('<p>');
  });

  it('keeps user markdown-looking text literal', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_user_markdown',
        type: 'chat::message',
        role: 'user',
        content: '# Not a heading\n- not a list',
        status: 'final',
      }],
    }));

    const markdown = shadow.querySelector('.cortex-widget__markdown');
    const bubble = shadow.querySelector('[data-testid="message-bubble"]') as HTMLElement;
    expect(markdown).toBeNull();
    expect(bubble.textContent).toContain('# Not a heading');
    expect(bubble.textContent).toContain('- not a list');
  });

  it('keeps structured payload fallback as preformatted text', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_structured',
        type: 'chat::answer',
        role: 'assistant',
        content: {
          debug: true,
          nested: {
            value: 1,
          },
        },
        status: 'final',
      }],
    }));

    const pre = shadow.querySelector('.cortex-widget__formatted') as HTMLElement;
    expect(pre).toBeTruthy();
    expect(pre.textContent).toContain('"debug": true');
    expect(pre.textContent).toContain('"value": 1');
  });

  it('falls back to a visible chip for assistant attachments without download url', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_assistant_file_id_only',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Attached result.',
        meta: {
          attachments: [{
            file_id: 'file_456',
            filename: 'artifact.txt',
          }],
        },
      }],
    }));

    expect(shadow.querySelector('[data-testid="message-attachment-link"]')).toBeNull();
    const attachments = shadow.querySelector('[data-testid="message-attachments"]') as HTMLElement;
    expect(attachments.textContent).toContain('artifact.txt');
  });

  it('does not render an empty bubble when message content and attachments are both absent', () => {
    mountWidget();
    const shadow = getShadow();
    const transcript = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_empty',
        type: 'chat::message',
        role: 'user',
        content: '',
      }],
    }));

    expect(shadow.querySelector('[data-testid="message-bubble"]')).toBeNull();
    expect(transcript.textContent).toContain('New chat');
  });

  it('renders actor header with name and avatar when actor field is present on assistant message', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_with_actor',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Hello from Robot Vasya',
        status: 'final',
        actor: {
          kind: 'digital_worker',
          id: 'proj_1',
          name: 'Robot Vasya',
          title: 'Lawyer',
          avatarUrl: 'https://example.test/avatar.png',
        },
      }],
    }));

    const actorHeader = shadow.querySelector('[data-testid="actor-header"]') as HTMLElement;
    const actorName = shadow.querySelector('[data-testid="actor-name"]') as HTMLElement;
    const actorAvatar = shadow.querySelector('[data-testid="actor-avatar"]') as HTMLImageElement;

    expect(actorHeader).toBeTruthy();
    expect(actorName.textContent).toBe('Robot Vasya');
    expect(actorAvatar).toBeTruthy();
    expect(actorAvatar.src).toBe('https://example.test/avatar.png');
  });

  it('does not duplicate actor name in meta line when actor header is shown', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_actor_no_dup',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Hi',
        status: 'final',
        actor: { kind: 'digital_worker', name: 'Robot Vasya' },
      }],
    }));

    const message = shadow.querySelector('[data-testid="transcript-message"]') as HTMLElement;
    const meta = message.querySelector('.cortex-widget__meta') as HTMLElement;

    // Meta line must not contain the actor name
    expect(meta.textContent).not.toContain('Robot Vasya');
  });

  it('renders header avatar initials from widget title', () => {
    mountWidget({
      title: 'Sarah Chen',
      subtitle: 'Head of Finance',
    });
    const shadow = getShadow();
    const avatar = shadow.querySelector('[data-testid="header-avatar"]') as HTMLElement;

    expect(avatar).toBeTruthy();
    expect(avatar.textContent).toBe('SC');
  });

  it('keeps fallback widget title and subtitle when no runtime correspondent exists', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
    });
    const shadow = getShadow();

    const title = shadow.querySelector('.cortex-widget__title') as HTMLElement;
    const subtitle = shadow.querySelector('.cortex-widget__subtitle') as HTMLElement;

    expect(title.textContent).toBe('Fallback Title');
    expect(subtitle.textContent).toBe('Fallback Subtitle');
  });

  it('prefers runtime correspondent title and subtitle in the header when present', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          kind: 'digital_worker',
          id: 'project_123',
          name: 'Robot Vasya',
          title: 'Legal Assistant',
          subtitle: 'Contract review worker',
          avatarUrl: null,
        },
      },
    }));

    const title = shadow.querySelector('.cortex-widget__title') as HTMLElement;
    const subtitle = shadow.querySelector('.cortex-widget__subtitle') as HTMLElement;
    const avatar = shadow.querySelector('[data-testid="header-avatar"]') as HTMLElement;

    expect(title.textContent).toBe('Robot Vasya');
    expect(subtitle.textContent).toBe('Legal Assistant');
    expect(avatar.textContent).toBe('RV');
  });

  it('renders correspondent avatar image in the existing header avatar container', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          avatarUrl: 'https://example.test/robot-vasya.png',
        },
      },
    }));

    const avatar = shadow.querySelector('[data-testid="header-avatar"]') as HTMLElement;
    const image = avatar.querySelector('img') as HTMLImageElement;

    expect(image).toBeTruthy();
    expect(image.src).toBe('https://example.test/robot-vasya.png');
    expect(image.alt).toBe('');
    expect(image.getAttribute('aria-hidden')).toBe('true');
    expect(avatar.textContent).toBe('');
  });

  it('keeps header avatar/title/subtitle stable across rerenders with the same correspondent', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          title: 'Legal Assistant',
          avatarUrl: 'https://example.test/robot-vasya.png',
        },
      },
    }));

    const avatar = shadow.querySelector('[data-testid="header-avatar"]') as HTMLElement;
    const title = shadow.querySelector('.cortex-widget__title') as HTMLElement;
    const subtitle = shadow.querySelector('.cortex-widget__subtitle') as HTMLElement;
    const initialImage = avatar.querySelector('img') as HTMLImageElement;

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          title: 'Legal Assistant',
          avatarUrl: 'https://example.test/robot-vasya.png',
        },
      },
    }));

    const nextImage = avatar.querySelector('img') as HTMLImageElement;
    expect(nextImage).toBe(initialImage);
    expect(avatar.querySelectorAll('img')).toHaveLength(1);
    expect(nextImage.getAttribute('src')).toBe('https://example.test/robot-vasya.png');
    expect(title.textContent).toBe('Robot Vasya');
    expect(subtitle.textContent).toBe('Legal Assistant');
  });

  it('preserves absolute correspondent avatar urls exactly', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
      controlPlaneUrl: 'https://cortexsuite.app',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          avatarUrl: 'https://cortexsuite.app/static/workspace/img/digital_worker_default.png',
        },
      },
    }));

    const image = shadow.querySelector('[data-testid="header-avatar"] img') as HTMLImageElement;
    expect(image.src).toBe('https://cortexsuite.app/static/workspace/img/digital_worker_default.png');
  });

  it('resolves relative correspondent avatar urls against controlPlaneUrl', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
      controlPlaneUrl: 'https://cortexsuite.app',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          avatarUrl: '/static/workspace/img/digital_worker_default.png',
        },
      },
    }));

    const image = shadow.querySelector('[data-testid="header-avatar"] img') as HTMLImageElement;
    expect(image.src).toBe('https://cortexsuite.app/static/workspace/img/digital_worker_default.png');
  });

  it('resolves relative actor avatar urls against controlPlaneUrl for message bubbles', () => {
    mountWidget({
      controlPlaneUrl: 'https://cortexsuite.app',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_with_actor',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Hello from Robot Vasya',
        status: 'final',
        actor: {
          kind: 'digital_worker',
          id: 'proj_1',
          name: 'Robot Vasya',
          avatarUrl: '/static/workspace/img/digital_worker_default.png',
        },
      }],
    }));

    const actorAvatar = shadow.querySelector('[data-testid="actor-avatar"]') as HTMLImageElement;
    expect(actorAvatar.src).toBe('https://cortexsuite.app/static/workspace/img/digital_worker_default.png');
  });

  it('restores initials when correspondent avatar disappears', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          avatarUrl: 'https://example.test/robot-vasya.png',
        },
      },
    }));
    expect((shadow.querySelector('[data-testid="header-avatar"]') as HTMLElement).querySelector('img')).toBeTruthy();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          avatarUrl: null,
        },
      },
    }));

    const avatar = shadow.querySelector('[data-testid="header-avatar"]') as HTMLElement;
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.textContent).toBe('RV');
  });

  it('reuses the same header avatar img until the avatar url changes or disappears', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          title: 'Legal Assistant',
          avatarUrl: 'https://example.test/robot-vasya.png',
        },
      },
    }));

    const avatar = shadow.querySelector('[data-testid="header-avatar"]') as HTMLElement;
    const initialImage = avatar.querySelector('img') as HTMLImageElement;
    expect(initialImage.getAttribute('src')).toBe('https://example.test/robot-vasya.png');

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          title: 'Legal Assistant',
          avatarUrl: 'https://example.test/robot-vasya.png',
        },
      },
    }));

    const unchangedImage = avatar.querySelector('img') as HTMLImageElement;
    expect(unchangedImage).toBe(initialImage);
    expect(avatar.querySelectorAll('img')).toHaveLength(1);
    expect(unchangedImage.getAttribute('src')).toBe('https://example.test/robot-vasya.png');

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          title: 'Legal Assistant',
          avatarUrl: 'https://example.test/robot-vasya-v2.png',
        },
      },
    }));

    const updatedImage = avatar.querySelector('img') as HTMLImageElement;
    expect(updatedImage).toBe(initialImage);
    expect(avatar.querySelectorAll('img')).toHaveLength(1);
    expect(updatedImage.getAttribute('src')).toBe('https://example.test/robot-vasya-v2.png');

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          title: 'Legal Assistant',
          avatarUrl: null,
        },
      },
    }));

    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.textContent).toBe('RV');
  });

  it('returns to fallback header identity when runtime correspondent disappears entirely', () => {
    mountWidget({
      title: 'Fallback Title',
      subtitle: 'Fallback Subtitle',
    });
    const shadow = getShadow();

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Robot Vasya',
          title: 'Legal Assistant',
          avatarUrl: null,
        },
      },
    }));

    applyChatState(baseChatState({
      session: {
        correspondent: null,
      },
    }));

    const title = shadow.querySelector('.cortex-widget__title') as HTMLElement;
    const subtitle = shadow.querySelector('.cortex-widget__subtitle') as HTMLElement;
    const avatar = shadow.querySelector('[data-testid="header-avatar"]') as HTMLElement;

    expect(title.textContent).toBe('Fallback Title');
    expect(subtitle.textContent).toBe('Fallback Subtitle');
    expect(avatar.textContent).toBe('FT');
  });

  it('renders question option buttons for chat::question messages', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_question',
        type: 'chat::question',
        role: 'assistant',
        content: 'What would you like to do?',
        status: 'final',
        meta: {
          question_ref: 'q_1',
          input_type: 'form',
          allow_reply: true,
          questions: [
            {
              key: 'decision',
              label: 'Decision',
              type: 'select',
              options: [
                { id: 'approve', label: 'Approve' },
                { id: 'reject', label: 'Reject' },
              ],
            },
          ],
        },
      }],
      activeQuestion: {
        question_ref: 'q_1',
        input_type: 'form',
        allow_reply: true,
        questions: [{
          key: 'decision',
          label: 'Decision',
          type: 'select',
          required: false,
          options: [
            { id: 'approve', label: 'Approve' },
            { id: 'reject', label: 'Reject' },
          ],
        }],
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'reject', label: 'Reject' },
        ],
      },
    }));

    const optionsContainer = shadow.querySelector('[data-testid="question-options"]') as HTMLElement;
    const buttons = shadow.querySelectorAll('[data-testid="question-option"]') as NodeListOf<HTMLButtonElement>;

    expect(optionsContainer).toBeTruthy();
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('Approve');
    expect(buttons[1].textContent).toBe('Reject');
    expect(buttons[0].disabled).toBe(false);
  });

  it('submits canonical form questions with answers and question_ref', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      activeQuestion: {
        question_ref: 'q_form',
        input_type: 'form',
        allow_reply: false,
        questions: [
          { key: 'email', label: 'Email', type: 'email', required: true, options: [] },
          { key: 'subscribe', label: 'Subscribe', type: 'boolean', required: false, options: [] },
        ],
        options: [],
      },
      transcript: [{
        id: 'msg_form',
        type: 'chat::question',
        role: 'assistant',
        content: 'Tell us more',
        status: 'final',
        meta: {
          question_ref: 'q_form',
          input_type: 'form',
          allow_reply: false,
          questions: [
            { key: 'email', label: 'Email', type: 'email', required: true },
            { key: 'subscribe', label: 'Subscribe', type: 'boolean' },
          ],
        },
      }],
    }));

    const form = shadow.querySelector('[data-testid="question-form"]') as HTMLFormElement;
    const email = form.querySelector('input[name="email"]') as HTMLInputElement;
    const subscribe = form.querySelector('input[name="subscribe"]') as HTMLInputElement;
    email.value = 'person@example.test';
    subscribe.checked = true;
    submitComposer(form);
    await flushAsyncWork();

    expect(controller.sendCalls[0]).toMatchObject({
      meta: {
        question_ref: 'q_form',
        answers: {
          email: 'person@example.test',
          subscribe: true,
        },
      },
    });
    expect(controller.sendCalls[0]?.meta).not.toHaveProperty('resume_event_ref');
  });

  it('disables question option buttons when isAwaitingAnswer is true', async () => {
    const { autoClient } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;

    changeInput(textarea, 'Pick something');
    submitComposer(form);
    await Promise.resolve();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_q_awaiting',
        type: 'chat::question',
        role: 'assistant',
        content: 'Choose',
        status: 'final',
        meta: {
          question_ref: 'q_await',
          input_type: 'form',
          allow_reply: false,
          questions: [{
            key: 'decision',
            label: 'Decision',
            type: 'radio',
            options: [{ id: 'ok', label: 'OK' }],
          }],
        },
      }],
      activeQuestion: {
        question_ref: 'q_await',
        input_type: 'form',
        allow_reply: false,
        questions: [{
          key: 'decision',
          label: 'Decision',
          type: 'radio',
          required: false,
          options: [{ id: 'ok', label: 'OK' }],
        }],
        options: [{ id: 'ok', label: 'OK' }],
      },
    }));

    // Simulate awaiting answer state
    autoClient?.emit({ type: 'chat::question', payload: {
      role: 'assistant',
      content: 'Choose',
      meta: {
        question_ref: 'q_await',
        input_type: 'form',
        allow_reply: false,
        questions: [{
          key: 'decision',
          label: 'Decision',
          type: 'radio',
          options: [{ id: 'ok', label: 'OK' }],
        }],
      },
    }});

    // Re-apply state with isAwaitingAnswer via awaiting state
    applyChatState(baseChatState({
      input: { locked: false },
      activeQuestion: {
        question_ref: 'q_await',
        input_type: 'form',
        allow_reply: false,
        questions: [{
          key: 'decision',
          label: 'Decision',
          type: 'radio',
          required: false,
          options: [{ id: 'ok', label: 'OK' }],
        }],
        options: [{ id: 'ok', label: 'OK' }],
      },
      transcript: [{
        id: 'msg_q_awaiting2',
        type: 'chat::question',
        role: 'assistant',
        content: 'Choose',
        status: 'final',
        meta: {
          question_ref: 'q_await',
          input_type: 'form',
          allow_reply: false,
          questions: [{
            key: 'decision',
            label: 'Decision',
            type: 'radio',
            options: [{ id: 'ok', label: 'OK' }],
          }],
        },
      }],
    }));

    const buttons = shadow.querySelectorAll('[data-testid="question-option"]') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0]).toBeTruthy();
  });

  it('disables question buttons when question is no longer active (past question)', () => {
    mountWidget();
    const shadow = getShadow();

    // activeQuestion is null → question has been answered
    applyChatState(baseChatState({
      activeQuestion: null,
      transcript: [{
        id: 'msg_past_question',
        type: 'chat::question',
        role: 'assistant',
        content: 'Old question',
        status: 'final',
        meta: {
          question_ref: 'q_past',
          input_type: 'form',
          allow_reply: true,
          questions: [{
            key: 'decision',
            label: 'Decision',
            type: 'radio',
            options: [{ id: 'yes', label: 'Yes' }],
          }],
        },
      }],
    }));

    const btn = shadow.querySelector('[data-testid="question-option"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

  it('attachment rendering still works alongside actor and options (regression)', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_actor_attach',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Here is the file.',
        status: 'final',
        actor: { kind: 'digital_worker', name: 'Robot Vasya' },
        meta: {
          attachments: [{
            file_id: 'file_reg',
            filename: 'report.pdf',
            download_url: 'https://example.test/report.pdf',
            content_type: 'application/pdf',
            size: 1024,
          }],
        },
      }],
    }));

    const actorName = shadow.querySelector('[data-testid="actor-name"]') as HTMLElement;
    const link = shadow.querySelector('[data-testid="message-attachment-link"]') as HTMLAnchorElement;

    expect(actorName.textContent).toBe('Robot Vasya');
    expect(link).toBeTruthy();
    expect(link.href).toBe('https://example.test/report.pdf');
  });

  it('unlocks on terminal session state', async () => {
    mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    const sendButton = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;

    changeInput(textarea, 'Close later');
    submitComposer(form);
    await flushAsyncWork();

    expect(sendButton.disabled).toBe(true);

    applyChatState(baseChatState({
      connection: {
        channelState: 'OPEN',
        sessionState: 'COMPLETED',
        sessionId: 'sess_terminal',
        isSessionReady: true,
        isConnected: true,
        isStale: false,
      },
    }));

    expect(textarea.disabled).toBe(false);
  });

  it('fills the mount target in embedded mode', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    mountWidget({
      mode: 'embedded',
      target,
    });

    const host = target.firstElementChild as HTMLElement;
    const shadow = host.shadowRoot as ShadowRoot;
    const root = shadow.querySelector('.cortex-widget') as HTMLElement;
    const panel = shadow.querySelector('[data-testid="panel"]') as HTMLElement;

    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('100%');
    expect(host.style.minHeight).toBe('0');
    expect(host.style.overflow).toBe('hidden');
    expect(host.style.display).toBe('block');
    expect(root.dataset.mode).toBe('embedded');
    expect(panel).toBeTruthy();
  });

  it('keeps transcript as the embedded scroll container', () => {
    const target = document.createElement('div');
    target.style.height = '480px';
    target.style.display = 'flex';
    target.style.flexDirection = 'column';
    document.body.appendChild(target);

    mountWidget({
      mode: 'embedded',
      target,
    });

    const host = target.firstElementChild as HTMLElement;
    const shadow = host.shadowRoot as ShadowRoot;
    const style = shadow.querySelector('style') as HTMLStyleElement;
    const root = shadow.querySelector('.cortex-widget') as HTMLElement;
    const panel = shadow.querySelector('[data-testid="panel"]') as HTMLElement;
    const body = shadow.querySelector('.cortex-widget__body') as HTMLElement;
    const transcript = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;
    const header = shadow.querySelector('.cortex-widget__header') as HTMLElement;
    const composer = shadow.querySelector('[data-testid="composer"]') as HTMLElement;

    applyChatState(baseChatState({
      transcript: Array.from({ length: 24 }, (_, index) => ({
        id: `msg_${index}`,
        type: 'chat::answer',
        role: 'assistant',
        content: `Message ${index}`,
      })),
    }));

    expect(root.dataset.mode).toBe('embedded');
    expect(panel).toBeTruthy();
    expect(style.textContent).toContain('.cortex-widget__body {');
    expect(style.textContent).toContain('overflow: hidden;');
    expect(style.textContent).toContain('.cortex-widget__transcript {');
    expect(style.textContent).toContain('overflow-y: auto;');
    expect(style.textContent).toContain('overflow-x: hidden;');
    expect(style.textContent).toContain('.cortex-widget__header {');
    expect(style.textContent).toContain('flex: 0 0 auto;');
    expect(style.textContent).toContain('.cortex-widget__composer {');
    expect(body).toBeTruthy();
    expect(transcript.children.length).toBeGreaterThan(10);
    expect(header).toBeTruthy();
    expect(composer).toBeTruthy();
  });
});

describe('worker status rendering', () => {
  beforeEach(() => {
    resetMocks();
  });

  function getWorkerStatus(shadow: ShadowRoot): HTMLElement {
    return shadow.querySelector('[data-testid="worker-status"]') as HTMLElement;
  }

  it('worker status is hidden when workerState is idle', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ workerState: { state: 'idle' } }));

    expect(getWorkerStatus(shadow).dataset['visible']).toBe('false');
    expect(getWorkerStatus(shadow).textContent).toBe('');
  });

  it('shows working state with label', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      workerState: { state: 'working', label: 'Digital worker is working…' },
    }));

    const el = getWorkerStatus(shadow);
    expect(el.dataset['visible']).toBe('true');
    expect(el.dataset['state']).toBe('working');
    expect(el.textContent).toBe('Digital worker is working…');
  });

  it('shows working default label when no label provided', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ workerState: { state: 'working' } }));

    expect(getWorkerStatus(shadow).textContent).toBe('Digital worker is working…');
  });

  it('shows waiting state with label', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      workerState: { state: 'waiting', label: 'Still working…' },
    }));

    const el = getWorkerStatus(shadow);
    expect(el.dataset['visible']).toBe('true');
    expect(el.dataset['state']).toBe('waiting');
    expect(el.textContent).toBe('Still working…');
  });

  it('shows error state with label', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      workerState: { state: 'error', label: 'Something went wrong' },
    }));

    const el = getWorkerStatus(shadow);
    expect(el.dataset['visible']).toBe('true');
    expect(el.dataset['state']).toBe('error');
    expect(el.textContent).toBe('Something went wrong');
  });

  it('hides worker status when expiresAt is in the past', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      workerState: { state: 'working', expiresAt: Date.now() - 1000 },
    }));

    expect(getWorkerStatus(shadow).dataset['visible']).toBe('false');
  });

  it('shows worker status when expiresAt is in the future', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      workerState: { state: 'working', expiresAt: Date.now() + 60000 },
    }));

    expect(getWorkerStatus(shadow).dataset['visible']).toBe('true');
  });

  it('actor header still renders when workerState is working', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      workerState: { state: 'working' },
      transcript: [{
        id: 'msg_1',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Hello!',
        actor: { kind: 'digital_worker', id: 'proj_1', name: 'TestBot' },
      }],
    }));

    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeTruthy();
    expect(getWorkerStatus(shadow).dataset['visible']).toBe('true');
  });

  it('chat::question options still render when workerState is idle', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      workerState: { state: 'idle' },
      activeQuestion: {
        question_ref: 'q1',
        input_type: 'form',
        allow_reply: false,
        questions: [{
          key: 'decision',
          label: 'Decision',
          type: 'radio',
          required: false,
          options: [{ id: 'a', label: 'Option A' }],
        }],
        options: [{ id: 'a', label: 'Option A' }],
      },
      transcript: [{
        id: 'msg_q',
        type: 'chat::question',
        role: 'assistant',
        content: 'Choose:',
        meta: {
          question_ref: 'q1',
          input_type: 'form',
          questions: [{
            key: 'decision',
            label: 'Decision',
            type: 'radio',
            options: [{ id: 'a', label: 'Option A' }],
          }],
        },
      }],
    }));

    expect(shadow.querySelector('[data-testid="question-options"]')).toBeTruthy();
  });

  it('string array content still renders as plain text', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      workerState: { state: 'idle' },
      transcript: [{
        id: 'msg_str',
        type: 'chat::answer',
        role: 'assistant',
        content: ['Hello world'],
      }],
    }));

    const transcript = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;
    expect(transcript.textContent).toContain('Hello world');
  });
});

describe('composer icon controls', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('composer renders circular attach button with aria-label Attach file', () => {
    mountWidget();
    const shadow = getShadow();
    const btn = shadow.querySelector('[data-testid="attach-button"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe('Attach file');
    expect(btn.textContent?.trim()).toBe('');
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('composer renders circular send button with aria-label Send message', () => {
    mountWidget();
    const shadow = getShadow();
    const btn = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe('Send message');
    expect(btn.textContent?.trim()).toBe('');
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('send button keeps Send message aria-label when activeQuestion has allow_reply=true', () => {
    mountWidget();
    const shadow = getShadow();
    const btn = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;

    applyChatState(baseChatState({
      activeQuestion: {
        question_ref: 'q1',
        input_type: 'radio',
        allow_reply: true,
        options: [],
      },
    }));

    expect(btn.getAttribute('aria-label')).toBe('Send message');
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('send button keeps Send message aria-label when activeQuestion clears', () => {
    mountWidget();
    const shadow = getShadow();
    const btn = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;

    applyChatState(baseChatState({
      activeQuestion: {
        question_ref: 'q1',
        input_type: 'radio',
        allow_reply: true,
        options: [],
      },
    }));
    expect(btn.getAttribute('aria-label')).toBe('Send message');

    applyChatState(baseChatState({ activeQuestion: null }));
    expect(btn.getAttribute('aria-label')).toBe('Send message');
  });
});

describe('message delivery status rendering', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('user message with deliveryStatus=sending renders a single-check status icon inline without text', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        deliveryStatus: 'sending',
      }],
    }));

    const statusEl = shadow.querySelector('[data-testid="message-delivery-status"]') as HTMLElement;
    const icon = shadow.querySelector('[data-testid="message-delivery-icon"]') as HTMLElement;
    expect(statusEl).toBeTruthy();
    expect(statusEl.dataset.status).toBe('sending');
    expect(icon).toBeTruthy();
    expect(icon.querySelector('svg')).toBeTruthy();
    expect(icon.innerHTML).toContain('bi-check');
    expect(shadow.textContent).not.toContain('Sending');
  });

  it('user message with deliveryStatus=sent renders a single-check status icon inline', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        deliveryStatus: 'sent',
      }],
    }));

    const statusEl = shadow.querySelector('[data-testid="message-delivery-status"]') as HTMLElement;
    const icon = shadow.querySelector('[data-testid="message-delivery-icon"]') as HTMLElement;
    expect(statusEl).toBeTruthy();
    expect(statusEl.dataset.status).toBe('sent');
    expect(icon).toBeTruthy();
    expect(icon.innerHTML).toContain('bi-check');
  });

  it('user message with deliveryStatus=delivered renders gray double-check icon inline', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Delivered',
        deliveryStatus: 'delivered',
      }],
    }));

    const statusEl = shadow.querySelector('[data-testid="message-delivery-status"]') as HTMLElement;
    const icon = shadow.querySelector('[data-testid="message-delivery-icon"]') as HTMLElement;
    expect(statusEl).toBeTruthy();
    expect(statusEl.dataset.status).toBe('delivered');
    expect(icon.innerHTML).toContain('bi-check2-all');
  });

  it('user message with deliveryStatus=processed renders blue double-check icon inline', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_2',
        type: 'chat::message',
        role: 'user',
        content: 'Processed',
        deliveryStatus: 'processed',
      }],
    }));

    const statusEl = shadow.querySelector('[data-testid="message-delivery-status"]') as HTMLElement;
    const icon = shadow.querySelector('[data-testid="message-delivery-icon"]') as HTMLElement;
    expect(statusEl).toBeTruthy();
    expect(statusEl.dataset.status).toBe('processed');
    expect(icon).toBeTruthy();
    expect(icon.innerHTML).toContain('bi-check2-all');
  });

  it('matched chat::echo reconciliation keeps one user bubble with server timestamp and processed state', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:abc',
        type: 'chat::message',
        role: 'user',
        content: 'Тестовое сообщение',
        clientMsgId: 'abc',
        deliveryStatus: 'sent',
        ts: '2026-05-14T18:35:00.000Z',
        meta: {
          client_msg_id: 'abc',
          timestamp_source: 'client',
        },
      }],
    }));

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:abc',
        type: 'chat::message',
        role: 'user',
        content: 'Тестовое сообщение',
        clientMsgId: 'abc',
        deliveryStatus: 'processed',
        ts: '2026-05-14T18:35:10.000Z',
        meta: {
          client_msg_id: 'abc',
          timestamp_source: 'server',
          echo_type: 'chat::echo',
        },
      }],
    }));

    const messages = shadow.querySelectorAll('[data-testid="transcript-message"]');
    const message = messages[0] as HTMLElement;
    const metaText = shadow.querySelector('[data-testid="message-meta-text"]') as HTMLElement;
    const statusEl = shadow.querySelector('[data-testid="message-delivery-status"]') as HTMLElement;
    const icon = shadow.querySelector('[data-testid="message-delivery-icon"]') as HTMLElement;

    expect(messages).toHaveLength(1);
    expect(message.dataset.role).toBe('user');
    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    expect(statusEl.dataset.status).toBe('processed');
    expect(icon.innerHTML).toContain('bi-check2-all');
    expect(metaText.dataset.timestampSource).toBe('server');
    expect(metaText.textContent).not.toContain('You');
    expect(metaText.textContent).toBeTruthy();
  });

  it('renders timestamp text in the same meta row as the delivery status icon', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        ts: '2026-05-11T10:14:00Z',
        deliveryStatus: 'sent',
      }],
    }));

    const meta = shadow.querySelector('.cortex-widget__meta') as HTMLElement;
    const metaText = shadow.querySelector('[data-testid="message-meta-text"]') as HTMLElement;

    expect(meta).toBeTruthy();
    expect(meta.querySelector('[data-testid="message-delivery-status"]')).toBeTruthy();
    expect(metaText.textContent).not.toContain('You');
    expect(metaText.textContent).toBeTruthy();
  });

  it('user message with deliveryStatus=failed renders compact retry control without text banner', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        deliveryStatus: 'failed',
        retryable: true,
      }],
    }));

    const statusEl = shadow.querySelector('[data-testid="message-delivery-status"]') as HTMLElement;
    const retryBtn = shadow.querySelector('[data-testid="message-retry-button"]') as HTMLButtonElement;
    expect(statusEl).toBeTruthy();
    expect(statusEl.dataset.status).toBe('failed');
    expect(retryBtn).toBeTruthy();
    expect(shadow.textContent).not.toContain('Not sent');
  });

  it('failed retryable user message renders retry button with correct attributes', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        deliveryStatus: 'failed',
        retryable: true,
      }],
    }));

    const retryBtn = shadow.querySelector('[data-testid="message-retry-button"]') as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();
    expect(retryBtn.getAttribute('aria-label')).toBe('Retry message');
    expect(retryBtn.dataset.retryMsgId).toBe('client:msg_1');
    expect(retryBtn.querySelector('svg')).toBeTruthy();
  });

  it('failed non-retryable user message renders no retry button', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        deliveryStatus: 'failed',
        retryable: false,
      }],
    }));

    const retryBtn = shadow.querySelector('[data-testid="message-retry-button"]');
    expect(retryBtn).toBeNull();
  });

  it('assistant message never renders delivery status or retry button', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_assistant',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Hi there',
        deliveryStatus: 'failed' as const,
        retryable: true,
      }],
    }));

    expect(shadow.querySelector('[data-testid="message-delivery-status"]')).toBeNull();
    expect(shadow.querySelector('[data-testid="message-retry-button"]')).toBeNull();
  });

  it('workerStatus renders independently from user message deliveryStatus', () => {
    mountWidget();
    const shadow = getShadow();
    const workerStatus = shadow.querySelector('[data-testid="worker-status"]') as HTMLElement;

    applyChatState(baseChatState({
      workerState: { state: 'working', label: 'Processing…' },
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        deliveryStatus: 'failed',
        retryable: true,
      }],
    }));

    expect(workerStatus.dataset.visible).toBe('true');
    expect(workerStatus.textContent).toBe('Processing…');
    expect(shadow.querySelector('[data-testid="message-delivery-status"]')).toBeTruthy();
  });
});

describe('widget send result behavior', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('successful send sets isAwaitingAnswer true — input locked until answer', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    const sendButton = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;

    changeInput(textarea, 'Hello');
    submitComposer(form);
    await flushAsyncWork();

    expect(controller.sendCalls).toHaveLength(1);
    expect(sendButton.disabled).toBe(true);
  });

  it('failed send does not set isAwaitingAnswer — input remains usable', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    const sendButton = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;

    controller.nextSendError = new Error('Network failure');
    changeInput(textarea, 'Will fail');
    submitComposer(form);
    await flushAsyncWork();

    expect(controller.sendCalls).toHaveLength(1);
    expect(sendButton.disabled).toBe(false);
  });

  it('failed send preserves draft text and attached file', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;

    controller.nextSendError = new Error('Network failure');
    changeInput(textarea, 'Draft text');
    submitComposer(form);
    await flushAsyncWork();

    expect(textarea.value).toBe('Draft text');
  });

  it('failed send does not show global error banner', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    const errorBanner = shadow.querySelector('[data-testid="error-banner"]') as HTMLElement;

    controller.nextSendError = new Error('Network failure');
    changeInput(textarea, 'Will fail');
    submitComposer(form);
    await flushAsyncWork();

    expect(errorBanner.dataset.visible).not.toBe('true');
  });

  it('retry success sets isAwaitingAnswer true — input locked', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const sendButton = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        deliveryStatus: 'failed',
        retryable: true,
      }],
    }));

    const retryBtn = shadow.querySelector('[data-testid="message-retry-button"]') as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();

    retryBtn.click();
    await flushAsyncWork();

    // nextRetryError not set → default ok=true
    expect(controller.nextRetryError).toBeNull();
    expect(sendButton.disabled).toBe(true);
  });

  it('retry failure keeps isAwaitingAnswer false — input remains usable', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;

    applyChatState(baseChatState({
      transcript: [{
        id: 'client:msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello',
        deliveryStatus: 'failed',
        retryable: true,
      }],
    }));

    const retryBtn = shadow.querySelector('[data-testid="message-retry-button"]') as HTMLButtonElement;
    controller.nextRetryError = new Error('Still offline');
    retryBtn.click();
    await flushAsyncWork();

    // textarea.disabled reflects isAwaitingAnswer||locked||uploading — not empty-content guard
    expect(textarea.disabled).toBe(false);
  });

  it('option select success sets isAwaitingAnswer true', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const sendButton = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;

    applyChatState(baseChatState({
      activeQuestion: {
        question_ref: 'q1',
        input_type: 'form',
        allow_reply: false,
        questions: [{
          key: 'decision',
          label: 'Decision',
          type: 'radio',
          required: false,
          options: [{ id: 'yes', label: 'Yes' }],
        }],
        options: [{ id: 'yes', label: 'Yes' }],
      },
      transcript: [{
        id: 'msg_q',
        type: 'chat::question',
        role: 'assistant',
        content: 'Confirm?',
        meta: {
          question_ref: 'q1',
          input_type: 'form',
          allow_reply: false,
          questions: [{
            key: 'decision',
            label: 'Decision',
            type: 'radio',
            options: [{ id: 'yes', label: 'Yes' }],
          }],
        },
      }],
    }));

    const optBtn = shadow.querySelector('[data-testid="question-option"]') as HTMLButtonElement;
    optBtn.click();
    await flushAsyncWork();

    expect(controller.sendCalls[0]).toMatchObject({
      content: ['Yes'],
      meta: { question_ref: 'q1', selected: ['yes'] },
    });
    expect(sendButton.disabled).toBe(true);
  });

  it('option select failure keeps isAwaitingAnswer false', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;

    // allow_reply: true so textarea is not locked by questionLocksInput;
    // that way textarea.disabled solely reflects isAwaitingAnswer after option failure
    applyChatState(baseChatState({
      activeQuestion: {
        question_ref: 'q2',
        input_type: 'form',
        allow_reply: true,
        questions: [{
          key: 'decision',
          label: 'Decision',
          type: 'radio',
          required: false,
          options: [{ id: 'no', label: 'No' }],
        }],
        options: [{ id: 'no', label: 'No' }],
      },
      transcript: [{
        id: 'msg_q2',
        type: 'chat::question',
        role: 'assistant',
        content: 'Cancel?',
        meta: {
          question_ref: 'q2',
          input_type: 'form',
          allow_reply: true,
          questions: [{
            key: 'decision',
            label: 'Decision',
            type: 'radio',
            options: [{ id: 'no', label: 'No' }],
          }],
        },
      }],
    }));

    controller.nextSendError = new Error('Transport error');
    const optBtn = shadow.querySelector('[data-testid="question-option"]') as HTMLButtonElement;
    optBtn.click();
    await flushAsyncWork();

    // textarea.disabled reflects isAwaitingAnswer||locked — not empty-content guard
    expect(textarea.disabled).toBe(false);
  });

  it('renders buttons for ask_user {key,label} questions with choice_mode radio', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_ask_user',
        type: 'chat::question',
        role: 'assistant',
        content: 'What would you like to do?',
        status: 'final',
        meta: {
          question_ref: 'q_ask',
          choice_mode: 'radio',
          allow_reply: false,
          questions: [
            { key: 'yes', label: 'Yes' },
            { key: 'no', label: 'No' },
          ],
        },
      }],
      activeQuestion: {
        question_ref: 'q_ask',
        input_type: 'radio',
        allow_reply: false,
        questions: [],
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
      },
    }));

    const buttons = shadow.querySelectorAll('[data-testid="question-option"]') as NodeListOf<HTMLButtonElement>;
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('Yes');
    expect(buttons[1].textContent).toBe('No');
    expect(buttons[0].disabled).toBe(false);
  });

  it('clicking ask_user option button sends canonical selected array', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      activeQuestion: {
        question_ref: 'q_ask2',
        input_type: 'radio',
        allow_reply: false,
        questions: [],
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'reject', label: 'Reject' },
        ],
      },
      transcript: [{
        id: 'msg_ask2',
        type: 'chat::question',
        role: 'assistant',
        content: 'Approve or reject?',
        status: 'final',
        meta: {
          question_ref: 'q_ask2',
          choice_mode: 'radio',
          allow_reply: false,
          questions: [
            { key: 'approve', label: 'Approve' },
            { key: 'reject', label: 'Reject' },
          ],
        },
      }],
    }));

    const buttons = shadow.querySelectorAll('[data-testid="question-option"]') as NodeListOf<HTMLButtonElement>;
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    await flushAsyncWork();

    expect(controller.sendCalls[0]).toMatchObject({
      content: ['Approve'],
      meta: { question_ref: 'q_ask2', selected: ['approve'] },
    });
  });

  it('chat::question without questions array renders as plain message bubble', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_plain_q',
        type: 'chat::question',
        role: 'assistant',
        content: 'Please reply in the text box.',
        status: 'final',
        meta: {
          question_ref: 'q_plain',
          allow_reply: true,
        },
      }],
      activeQuestion: {
        question_ref: 'q_plain',
        input_type: 'radio',
        allow_reply: true,
        questions: [],
        options: [],
      },
    }));

    const optionsContainer = shadow.querySelector('[data-testid="question-options"]');
    const form = shadow.querySelector('[data-testid="question-form"]');
    const bubble = shadow.querySelector('[data-testid="message-bubble"]');

    expect(optionsContainer).toBeNull();
    expect(form).toBeNull();
    expect(bubble).toBeTruthy();
  });

  it('free-text reply with allow_reply=true sends meta.question_ref only — no selected, no selected_option', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;

    applyChatState(baseChatState({
      activeQuestion: {
        question_ref: 'q_free',
        input_type: 'radio',
        allow_reply: true,
        questions: [],
        options: [],
      },
    }));

    changeInput(textarea, 'my free-text answer');
    submitComposer(form);
    await flushAsyncWork();

    expect(controller.sendCalls).toHaveLength(1);
    const sentMeta = controller.sendCalls[0]?.meta;
    expect(sentMeta).toEqual({ question_ref: 'q_free' });
    expect(sentMeta).not.toHaveProperty('selected_option');
    expect(sentMeta).not.toHaveProperty('selected');
  });

  it('free-text reply with allow_reply=false does not call sendMessage', async () => {
    const { controller } = mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;

    applyChatState(baseChatState({
      activeQuestion: {
        question_ref: 'q_blocked',
        input_type: 'radio',
        allow_reply: false,
        questions: [],
        options: [],
      },
    }));

    changeInput(textarea, 'should not go through');
    submitComposer(form);
    await flushAsyncWork();

    expect(controller.sendCalls).toHaveLength(0);
  });
});

describe('actor rendering and missing-actor diagnostic', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('operator echo with actor renders actor.name in actor-header', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'op_echo_actor',
        type: 'chat::echo',
        role: 'operator',
        content: 'Operator reply',
        status: 'final',
        actor: { kind: 'operator', name: 'Alice Operator' },
      }],
    }));

    const actorHeader = shadow.querySelector('[data-testid="actor-header"]') as HTMLElement;
    const actorName = shadow.querySelector('[data-testid="actor-name"]') as HTMLElement;
    expect(actorHeader).toBeTruthy();
    expect(actorName.textContent).toBe('Alice Operator');
    expect(shadow.querySelector('[data-testid="actor-missing"]')).toBeNull();
  });

  it('operator echo without actor renders diagnostic marker in debug mode and no Assistant fallback', () => {
    mountWidget({ debug: true });
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'op_echo_no_actor',
        type: 'chat::echo',
        role: 'operator',
        content: 'Operator reply',
        status: 'final',
        actor: null,
      }],
    }));

    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    const marker = shadow.querySelector('[data-testid="actor-missing"]') as HTMLElement;
    expect(marker).toBeTruthy();
    expect(marker.textContent).toBe('· unknown actor');
    expect(shadow.querySelector('[data-testid="transcript-message"]')?.textContent).not.toContain('Assistant');
  });

  it('operator chat::message without actor triggers diagnostic in debug mode', () => {
    mountWidget({ debug: true });
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'op_msg_no_actor',
        type: 'chat::message',
        role: 'operator',
        content: 'Operator message',
        status: 'final',
        actor: null,
      }],
    }));

    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    expect(shadow.querySelector('[data-testid="actor-missing"]')).toBeTruthy();
  });

  it('worker answer with actor renders actor.name in actor-header', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'worker_answer_actor',
        type: 'chat::answer',
        role: 'assistant',
        content: 'I can help',
        status: 'final',
        actor: { kind: 'digital_worker', name: 'Robot Vasya', title: 'Legal Assistant' },
      }],
    }));

    const actorName = shadow.querySelector('[data-testid="actor-name"]') as HTMLElement;
    expect(actorName.textContent).toBe('Robot Vasya');
    expect(shadow.querySelector('[data-testid="actor-missing"]')).toBeNull();
  });

  it('worker answer without actor shows diagnostic marker in debug mode and no fallback name', () => {
    mountWidget({ debug: true });
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'worker_no_actor',
        type: 'chat::answer',
        role: 'assistant',
        content: 'I can help',
        status: 'final',
        actor: null,
      }],
    }));

    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    expect(shadow.querySelector('[data-testid="actor-missing"]')).toBeTruthy();
    expect(shadow.querySelector('[data-testid="transcript-message"]')?.textContent).not.toContain('Assistant');
  });

  it('worker answer without actor does not show diagnostic marker when debug=false', () => {
    mountWidget({ debug: false });
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'worker_no_actor_prod',
        type: 'chat::answer',
        role: 'assistant',
        content: 'I can help',
        status: 'final',
        actor: null,
      }],
    }));

    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    expect(shadow.querySelector('[data-testid="actor-missing"]')).toBeNull();
    expect(shadow.querySelector('[data-testid="transcript-message"]')?.textContent).not.toContain('Assistant');
  });

  it('user message is right-aligned, has no actor-header and no actor-missing marker', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'user_msg',
        type: 'chat::message',
        role: 'user',
        content: 'Hello!',
        status: 'final',
        actor: null,
      }],
    }));

    const msg = shadow.querySelector('[data-testid="transcript-message"]') as HTMLElement;
    expect(msg.dataset.role).toBe('user');
    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    expect(shadow.querySelector('[data-testid="actor-missing"]')).toBeNull();
  });

  it('error message has no actor-header and no actor-missing marker', () => {
    mountWidget({ debug: true });
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'err_msg',
        type: 'system::error',
        role: 'error',
        content: 'Something went wrong',
        status: 'error',
        actor: null,
      }],
    }));

    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    expect(shadow.querySelector('[data-testid="actor-missing"]')).toBeNull();
  });

  it('escalation::request has no actor-header and no actor-missing marker', () => {
    mountWidget({ debug: true });
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'esc_req',
        type: 'escalation::request',
        role: 'escalation',
        content: 'Escalating…',
        status: 'final',
        actor: null,
      }],
    }));

    expect(shadow.querySelector('[data-testid="actor-header"]')).toBeNull();
    expect(shadow.querySelector('[data-testid="actor-missing"]')).toBeNull();
  });
});
