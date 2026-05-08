import { __getLastController } from './mocks/sdk-ui.js';
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

  it('does not render optimistic local user messages and renders backend echo only', async () => {
    mountWidget();
    const shadow = getShadow();
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    const transcript = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;

    changeInput(textarea, 'Hello from user');
    submitComposer(form);
    await Promise.resolve();

    expect(__getLastController()?.sendCalls).toHaveLength(1);
    expect(transcript.textContent).not.toContain('Hello from user');

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_1',
        type: 'chat::message',
        role: 'user',
        content: 'Hello from user',
      }],
    }));

    expect(transcript.textContent).toContain('Hello from user');
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
    await Promise.resolve();

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
      attachments: ['attachment:second.txt'],
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

  it('renders a visible user message for attachment-only backend echo without an empty bubble', () => {
    mountWidget();
    const shadow = getShadow();
    const transcript = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_attachment_only',
        type: 'chat::message',
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
        type: 'chat::message',
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
    expect(transcript.textContent).toContain('Start the conversation when you are ready.');
  });

  it('renders actor header with name and avatar when meta.actor is present on assistant message', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({
      transcript: [{
        id: 'msg_with_actor',
        type: 'chat::answer',
        role: 'assistant',
        content: 'Hello from Robot Vasya',
        status: 'final',
        meta: {
          actor: {
            kind: 'digital_worker',
            id: 'proj_1',
            name: 'Robot Vasya',
            title: 'Lawyer',
            avatar_url: 'https://example.test/avatar.png',
          },
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
        meta: {
          actor: { kind: 'digital_worker', name: 'Robot Vasya' },
        },
      }],
    }));

    const message = shadow.querySelector('[data-testid="transcript-message"]') as HTMLElement;
    const meta = message.querySelector('.cortex-widget__meta') as HTMLElement;

    // Meta line must not contain the actor name
    expect(meta.textContent).not.toContain('Robot Vasya');
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
          question_id: 'q_1',
          input_type: 'radio',
          allow_reply: true,
          options: [
            { id: 'approve', label: 'Approve' },
            { id: 'reject', label: 'Reject' },
          ],
        },
      }],
      activeQuestion: {
        question_id: 'q_1',
        input_type: 'radio',
        allow_reply: true,
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
          question_id: 'q_await',
          input_type: 'radio',
          allow_reply: false,
          options: [{ id: 'ok', label: 'OK' }],
        },
      }],
      activeQuestion: {
        question_id: 'q_await',
        input_type: 'radio',
        allow_reply: false,
        options: [{ id: 'ok', label: 'OK' }],
      },
    }));

    // Simulate awaiting answer state
    autoClient?.emit({ type: 'chat::question', payload: {
      role: 'assistant',
      content: 'Choose',
      meta: { question_id: 'q_await', input_type: 'radio', allow_reply: false, options: [{ id: 'ok', label: 'OK' }] },
    }});

    // Re-apply state with isAwaitingAnswer via awaiting state
    applyChatState(baseChatState({
      input: { locked: false },
      activeQuestion: {
        question_id: 'q_await',
        input_type: 'radio',
        allow_reply: false,
        options: [{ id: 'ok', label: 'OK' }],
      },
      transcript: [{
        id: 'msg_q_awaiting2',
        type: 'chat::question',
        role: 'assistant',
        content: 'Choose',
        status: 'final',
        meta: {
          question_id: 'q_await',
          input_type: 'radio',
          allow_reply: false,
          options: [{ id: 'ok', label: 'OK' }],
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
          question_id: 'q_past',
          input_type: 'radio',
          allow_reply: true,
          options: [{ id: 'yes', label: 'Yes' }],
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
        meta: {
          actor: { kind: 'digital_worker', name: 'Robot Vasya' },
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
    await Promise.resolve();

    expect(sendButton.disabled).toBe(true);

    applyChatState(baseChatState({
      connection: {
        channelState: 'OPEN',
        sessionState: 'COMPLETED',
        isConnected: true,
        isStale: false,
      },
    }));

    expect(textarea.disabled).toBe(false);
  });
});
