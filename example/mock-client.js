const DEMO_ACTOR = {
  kind: 'digital_worker',
  id: 'project_demo',
  name: 'Robot Vasya',
  title: 'Demo Assistant',
  subtitle: 'Demo digital worker',
  // Inline SVG avatar — no external file required
  avatar_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="%234f46e5"/><text x="14" y="19" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif">RV</text></svg>',
};

// Suffix for a mock sf_ reference; sf_ refs allow only [A-Za-z0-9_-].
function fileRefSuffix(name) {
  const trimmed = String(name ?? '').trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-');
  return normalized.replace(/^-|-$/g, '') || 'attachment';
}

function createEnvelope(type, sessionId, seq, payload) {
  return {
    type,
    schema: '1.0',
    session_id: sessionId,
    seq,
    payload,
    ts: new Date().toISOString(),
  };
}

// Public session-file descriptor (cortex-sdk contracts/session_file_attachments_v1.json).
function describeFile(fileRef, record, binding) {
  return {
    file_ref: fileRef,
    filename: record.filename,
    content_type: record.content_type,
    size: record.size,
    state: 'available',
    ...binding,
  };
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

export function createMockCortexClient() {
  const listeners = new Set();
  const timers = new Set();
  // sf_ ref -> { blob, filename, content_type, size }
  const uploadedFiles = new Map();
  const generatedFiles = new Map();
  let connected = false;
  let seq = 0;
  let turnNumber = 0;
  let uploadNumber = 0;
  let outputNumber = 0;
  const sessionId = `mock-session-${Date.now().toString(36)}`;

  function nextSeq() {
    seq += 1;
    return seq;
  }

  function emit(message) {
    for (const listener of Array.from(listeners)) {
      listener(message);
    }
  }

  function schedule(delayMs, callback) {
    const timerId = window.setTimeout(() => {
      timers.delete(timerId);
      callback();
    }, delayMs);
    timers.add(timerId);
  }

  function clearTimers() {
    for (const timerId of Array.from(timers)) {
      window.clearTimeout(timerId);
      timers.delete(timerId);
    }
  }

  function buildAnswerContent(content, fileCount) {
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (normalizedContent !== '') {
      return `Echo: ${normalizedContent}`;
    }
    if (fileCount > 0) {
      return fileCount === 1 ? 'I received your file.' : `I received your ${fileCount} files.`;
    }
    return 'Echo:';
  }

  function buildPartialChunks(finalContent) {
    if (finalContent.length <= 1) {
      return [finalContent];
    }
    const midpoint = Math.max(1, Math.ceil(finalContent.length / 2));
    return [finalContent.slice(0, midpoint), finalContent.slice(midpoint)];
  }

  function attachmentRefs(attachments) {
    if (!Array.isArray(attachments)) {
      return [];
    }
    return attachments
      .map((attachment) => (typeof attachment === 'string' ? attachment : attachment?.file_ref))
      .filter((fileRef) => typeof fileRef === 'string' && uploadedFiles.has(fileRef));
  }

  // One generated text file per answer that received files, bound to the answer's turn.
  function generateReceipt(fileRefs, turn) {
    outputNumber += 1;
    const lines = fileRefs.map((fileRef) => {
      const record = uploadedFiles.get(fileRef);
      return `${record.filename} (${record.size} bytes)`;
    });
    const text = `Received files:\n${lines.join('\n')}\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const record = {
      blob,
      filename: `received-files-${outputNumber}.txt`,
      content_type: 'text/plain',
      size: blob.size,
    };
    const fileRef = `sf_mock_out_${outputNumber}`;
    generatedFiles.set(fileRef, record);
    return describeFile(fileRef, record, {
      owner_role: 'assistant',
      direction: 'outbound',
      message_ref: String(turn),
      message_ref_kind: 'turn',
    });
  }

  return {
    sessionId,
    sessionState: 'ACTIVE',
    channelState: 'OPEN',

    async connect() {
      connected = true;
      this.channelState = 'OPEN';
      this.sessionState = 'ACTIVE';
    },

    async disconnect() {
      connected = false;
      clearTimers();
      uploadedFiles.clear();
      generatedFiles.clear();
      this.channelState = 'CLOSED';
    },

    onMessage(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    async uploadFile(file) {
      if (!(file instanceof Blob)) {
        throw makeError('file_type_rejected', 'The mock client uploads browser files only.');
      }
      uploadNumber += 1;
      const filename = typeof file.name === 'string' && file.name ? file.name : 'attachment';
      const fileRef = `sf_mock_${uploadNumber}_${fileRefSuffix(filename)}`;
      uploadedFiles.set(fileRef, {
        blob: file,
        filename,
        content_type: file.type || 'application/octet-stream',
        size: file.size,
      });
      return fileRef;
    },

    async downloadFile(fileRef) {
      const record = generatedFiles.get(fileRef);
      if (!record) {
        throw makeError('file_not_found', 'File not found.');
      }
      return record.blob;
    },

    async sendMessage({ content, attachments, meta }) {
      if (!connected) {
        throw new Error('Mock client is not connected.');
      }

      turnNumber += 1;
      const turn = turnNumber;
      const fileRefs = attachmentRefs(attachments);
      const clientMsgId = meta && typeof meta.client_msg_id === 'string' ? meta.client_msg_id : null;

      // Runtime chat text is list[str].
      const contentBlocks = Array.isArray(content)
        ? content.filter((block) => typeof block === 'string')
        : (typeof content === 'string' ? [content] : []);
      const contentStr = contentBlocks.filter(Boolean).join(' ');

      const finalContent = buildAnswerContent(contentStr, fileRefs.length);
      const partialChunks = buildPartialChunks(finalContent);

      // The user's files are confirmed on the echo, bound to its client_msg_id.
      const echoFiles = clientMsgId
        ? fileRefs.map((fileRef) => describeFile(fileRef, uploadedFiles.get(fileRef), {
            owner_role: 'user',
            direction: 'inbound',
            message_ref: clientMsgId,
            message_ref_kind: 'client_msg_id',
          }))
        : [];
      emit(createEnvelope('chat::echo', sessionId, nextSeq(), {
        role: 'user',
        content: contentBlocks,
        meta: {
          ...(meta && typeof meta === 'object' ? meta : {}),
          ...(echoFiles.length ? { attachments: echoFiles } : {}),
        },
      }));

      schedule(180, () => {
        emit(createEnvelope('typing::start', sessionId, nextSeq(), {}));
      });

      // Question demo: if message contains the word "question", emit chat::question instead
      if (contentStr.toLowerCase().includes('question')) {
        schedule(800, () => {
          emit(createEnvelope('chat::question', sessionId, nextSeq(), {
            role: 'assistant',
            turn,
            content: ['What would you like to do with this?'],
            meta: {
              actor: DEMO_ACTOR,
              question_ref: `q_turn_${turn}`,
              input_type: 'form',
              allow_reply: true,
              questions: [
                {
                  key: 'decision',
                  label: 'Decision',
                  type: 'radio',
                  required: true,
                  options: [
                    { id: 'approve', label: 'Approve' },
                    { id: 'reject', label: 'Reject' },
                  ],
                },
              ],
            },
          }));
        });

        schedule(900, () => {
          emit(createEnvelope('typing::stop', sessionId, nextSeq(), {}));
        });

        return;
      }

      // Runtime partials: list[str] chunks carrying the answer's integer turn, no meta.
      partialChunks.forEach((chunk, index) => {
        schedule(520 + (index * 380), () => {
          emit(createEnvelope('chat::partial', sessionId, nextSeq(), {
            role: 'assistant',
            turn,
            content: [chunk],
          }));
        });
      });

      schedule(1280, () => {
        const outputs = fileRefs.length ? [generateReceipt(fileRefs, turn)] : [];
        emit(createEnvelope('chat::answer', sessionId, nextSeq(), {
          role: 'assistant',
          turn,
          answer_kind: 'final',
          content: [finalContent],
          meta: {
            actor: DEMO_ACTOR,
            ...(outputs.length ? { attachments: outputs } : {}),
          },
        }));
      });

      schedule(1420, () => {
        emit(createEnvelope('typing::stop', sessionId, nextSeq(), {}));
      });
    },
  };
}
