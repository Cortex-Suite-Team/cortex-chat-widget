function sanitizeFileName(name) {
  const trimmed = String(name ?? '').trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-');
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

export function createMockCortexClient() {
  const listeners = new Set();
  const timers = new Set();
  const uploadedAttachments = new Map();
  let connected = false;
  let seq = 0;
  let turnNumber = 0;
  let uploadNumber = 0;
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

  function buildAnswerContent(content, attachments) {
    const normalizedContent = typeof content === 'string' ? content.trim() : '';

    if (normalizedContent !== '') {
      return `Echo: ${normalizedContent}`;
    }

    if (attachments?.length) {
      return 'I received your file.';
    }

    return 'Echo:';
  }

  function buildPartialChunks(content, attachments) {
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    const finalContent = normalizedContent !== ''
      ? `Echo: ${normalizedContent}`
      : (attachments?.length ? 'I received your file.' : 'Echo:');

    if (finalContent.length <= 1) {
      return [finalContent];
    }

    const midpoint = Math.max(1, Math.ceil(finalContent.length / 2));
    return [finalContent.slice(0, midpoint), finalContent.slice(midpoint)];
  }

  function toResolvedAttachment(id) {
    const stored = uploadedAttachments.get(id);
    if (!stored) {
      return {
        file_id: id,
        filename: id,
        content_type: 'application/octet-stream',
        size: null,
        download_url: null,
      };
    }

    return {
      file_id: id,
      filename: stored.filename,
      content_type: stored.content_type,
      size: stored.size,
      download_url: stored.download_url,
    };
  }

  function resolveAttachments(attachments) {
    if (!Array.isArray(attachments)) {
      return [];
    }

    return attachments.map((attachment) => {
      if (typeof attachment === 'string') {
        return toResolvedAttachment(attachment);
      }

      if (attachment && typeof attachment === 'object') {
        if (typeof attachment.file_id === 'string') {
          return toResolvedAttachment(attachment.file_id);
        }
        if (typeof attachment.attachment_id === 'string') {
          return toResolvedAttachment(attachment.attachment_id);
        }
      }

      return null;
    }).filter(Boolean);
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
      for (const item of uploadedAttachments.values()) {
        if (item.download_url) {
          URL.revokeObjectURL(item.download_url);
        }
      }
      uploadedAttachments.clear();
      this.channelState = 'CLOSED';
    },

    onMessage(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    async uploadAttachment(file) {
      uploadNumber += 1;
      const fileName = typeof file === 'string'
        ? file
        : (file && typeof file === 'object' && 'name' in file ? file.name : 'attachment');
      const id = `mock_file_${uploadNumber}_${sanitizeFileName(fileName)}`;
      const objectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && file instanceof Blob
        ? URL.createObjectURL(file)
        : null;

      uploadedAttachments.set(id, {
        file,
        filename: fileName,
        content_type: file && typeof file === 'object' && 'type' in file && typeof file.type === 'string' && file.type
          ? file.type
          : 'application/octet-stream',
        size: file && typeof file === 'object' && 'size' in file && typeof file.size === 'number'
          ? file.size
          : 0,
        download_url: objectUrl,
      });
      return id;
    },

    async sendMessage({ content, attachments }) {
      if (!connected) {
        throw new Error('Mock client is not connected.');
      }

      turnNumber += 1;
      const turnId = `turn_${turnNumber}`;
      const attachmentIds = Array.isArray(attachments) ? attachments : [];
      const resolvedAttachments = resolveAttachments(attachmentIds);
      const finalContent = buildAnswerContent(content, resolvedAttachments);
      const partialChunks = buildPartialChunks(content, resolvedAttachments);

      emit(createEnvelope('chat::message', sessionId, nextSeq(), {
        role: 'user',
        content,
        attachments: resolvedAttachments,
      }));

      schedule(180, () => {
        emit(createEnvelope('typing::start', sessionId, nextSeq(), {}));
      });

      schedule(520, () => {
        emit(createEnvelope('chat::partial', sessionId, nextSeq(), {
          role: 'assistant',
          turn_id: turnId,
          content: partialChunks[0],
        }));
      });

      schedule(900, () => {
        emit(createEnvelope('chat::partial', sessionId, nextSeq(), {
          role: 'assistant',
          turn_id: turnId,
          content: partialChunks[1],
        }));
      });

      schedule(1280, () => {
        emit(createEnvelope('chat::answer', sessionId, nextSeq(), {
          role: 'assistant',
          turn_id: turnId,
          answer_kind: 'final',
          content: finalContent,
          attachments: resolvedAttachments,
        }));
      });

      schedule(1420, () => {
        emit(createEnvelope('typing::stop', sessionId, nextSeq(), {}));
      });
    },
  };
}
