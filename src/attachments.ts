import type { ChatMessageViewModel, TranscriptAttachmentViewModel } from './types.js';

// Public session-file descriptor contract: @cortex-suite/sdk
// contracts/session_file_attachments_v1.json. SDK UI projects and reconciles
// message.meta.attachments; the widget only decides what to render and which
// file_ref a download button may pass to client.downloadFile().
export const FILE_REF_PATTERN = /^sf_[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const STATES = new Set(['available', 'expired', 'deleted', 'quarantined']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

// An assistant answer renders only complete assistant/outbound descriptors bound
// to its own turn. Anything else (inherited user uploads, other turns, internal
// ids, URLs) is never a generated file of this answer.
function toGeneratedFile(raw: unknown, turnRef: string): TranscriptAttachmentViewModel | null {
  if (!isRecord(raw)) return null;
  const fileRef = raw['file_ref'];
  if (typeof fileRef !== 'string' || !FILE_REF_PATTERN.test(fileRef)) return null;
  const fileName = nonEmptyString(raw['filename']);
  const contentType = nonEmptyString(raw['content_type']);
  const state = raw['state'];
  if (!fileName || !contentType || !isSize(raw['size']) || typeof state !== 'string' || !STATES.has(state)) {
    return null;
  }
  if (
    raw['owner_role'] !== 'assistant'
    || raw['direction'] !== 'outbound'
    || raw['message_ref_kind'] !== 'turn'
    || raw['message_ref'] !== turnRef
  ) {
    return null;
  }
  return {
    fileRef,
    label: fileName,
    fileName,
    contentType,
    size: raw['size'],
    state: state as TranscriptAttachmentViewModel['state'],
    generated: true,
  };
}

const OWNERSHIP_FIELDS = ['owner_role', 'direction', 'message_ref', 'message_ref_kind'];

// A user message shows its own files, display only:
// - on the locally sent chat::message, refs still being sent (no ownership fields yet);
// - otherwise only user/inbound descriptors confirmed for exactly this client_msg_id.
function toUserFile(
  raw: unknown,
  clientMsgId: string | null,
  pendingAllowed: boolean,
): TranscriptAttachmentViewModel | null {
  if (typeof raw === 'string') {
    return pendingAllowed && FILE_REF_PATTERN.test(raw)
      ? { fileRef: raw, label: 'Attached file', fileName: null, contentType: null, size: null, state: null, generated: false }
      : null;
  }
  if (!isRecord(raw)) return null;
  const fileRef = raw['file_ref'];
  if (typeof fileRef !== 'string' || !FILE_REF_PATTERN.test(fileRef)) return null;
  const pending = OWNERSHIP_FIELDS.every((field) => raw[field] === undefined);
  if (pending) {
    if (!pendingAllowed) return null;
  } else if (
    clientMsgId === null
    || raw['owner_role'] !== 'user'
    || raw['direction'] !== 'inbound'
    || raw['message_ref_kind'] !== 'client_msg_id'
    || raw['message_ref'] !== clientMsgId
  ) {
    return null;
  }
  const fileName = nonEmptyString(raw['filename']);
  const state = typeof raw['state'] === 'string' && STATES.has(raw['state']) ? raw['state'] : null;
  return {
    fileRef,
    label: fileName ?? 'Attached file',
    fileName,
    contentType: nonEmptyString(raw['content_type']),
    size: isSize(raw['size']) ? raw['size'] : null,
    state: state as TranscriptAttachmentViewModel['state'],
    generated: false,
  };
}

/** Files to render on a transcript message, in server order, at most 8, without repeats. */
export function getMessageAttachments(message: ChatMessageViewModel): TranscriptAttachmentViewModel[] {
  const raw = message.meta?.['attachments'];
  if (!Array.isArray(raw)) return [];

  let project: ((value: unknown) => TranscriptAttachmentViewModel | null) | null = null;
  if (message.type === 'chat::answer' && message.role === 'assistant') {
    const turnRef = nonEmptyString(message.meta?.['turnRef']);
    if (turnRef) project = (value) => toGeneratedFile(value, turnRef);
  } else if (message.role === 'user' && (message.type === 'chat::message' || message.type === 'chat::echo')) {
    const clientMsgId = message.clientMsgId ?? nonEmptyString(message.meta?.['client_msg_id']);
    const pendingAllowed = message.type === 'chat::message';
    project = (value) => toUserFile(value, clientMsgId, pendingAllowed);
  }
  if (!project) return [];

  const seen = new Set<string>();
  const result: TranscriptAttachmentViewModel[] = [];
  for (const item of raw) {
    if (result.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;
    const attachment = project(item);
    if (!attachment || seen.has(attachment.fileRef)) continue;
    seen.add(attachment.fileRef);
    result.push(attachment);
  }
  return result;
}

/** The generated file `fileRef` of `message`, when it is one this answer owns. */
export function findGeneratedFile(
  message: ChatMessageViewModel,
  fileRef: string,
): TranscriptAttachmentViewModel | null {
  return getMessageAttachments(message).find((attachment) => attachment.generated && attachment.fileRef === fileRef) ?? null;
}

// Bidi overrides could disguise the real extension of a saved file.
const UNSAFE_FILENAME_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*‪-‮⁦-⁩]/g;

/** A filename safe to hand to the browser's download attribute. */
export function safeDownloadFilename(name: string | null): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(UNSAFE_FILENAME_CHARS, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 255);
  return cleaned || 'download';
}
