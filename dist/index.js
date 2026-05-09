// ../cortex-sdk/js/dist/browser/generated/constants.js
var DEFAULT_AUTH_URL = "https://auth.cortexsuite.app";
var AUTH_TOKEN_PATH = "/auth/token";
var AUTH_REFRESH_PATH = "/auth/refresh";
var WS_SUBPROTOCOL = "cortex-sdk.v1";
var WS_SUBPROTOCOL_JWT_PREFIX = "cortex-sdk.jwt.";
var SCHEMA_VERSION = "1.0";
var DEFAULT_CONNECT_TIMEOUT_MS = 1e4;
var DEFAULT_SEND_TIMEOUT_MS = 1e4;
var DEFAULT_RESYNC_TIMEOUT_MS = 15e3;
var DEFAULT_PING_INTERVAL_MS = 15e3;
var DEFAULT_PONG_TIMEOUT_MS = 5e3;
var DEFAULT_STALE_THRESHOLD_MS = 45e3;
var TOKEN_REFRESH_BUFFER_MS = 6e4;
var CORTEX_AUTH_URL = `${DEFAULT_AUTH_URL}${AUTH_TOKEN_PATH}`;
var CORTEX_REFRESH_URL = `${DEFAULT_AUTH_URL}${AUTH_REFRESH_PATH}`;
var RECONNECT_BACKOFF_MS = [1e3, 2e3, 5e3, 1e4, 2e4, 3e4];

// ../cortex-sdk/js/dist/browser/generated/errors.js
var GENERATED_ERROR_CATALOG = [
  { code: "auth_invalid", retryable: false, fatal: true },
  { code: "auth_expired", retryable: true, fatal: false },
  { code: "auth_refresh_failed", retryable: false, fatal: true },
  { code: "transport_connect_timeout", retryable: true, fatal: false },
  { code: "transport_send_timeout", retryable: true, fatal: false },
  { code: "transport_protocol_violation", retryable: false, fatal: true },
  { code: "unknown_session", retryable: false, fatal: true },
  { code: "session_terminal", retryable: false, fatal: true },
  { code: "resync_timeout", retryable: true, fatal: false },
  { code: "replay_unavailable", retryable: true, fatal: false },
  { code: "upload_failed", retryable: true, fatal: false },
  { code: "upload_too_large", retryable: false, fatal: false },
  { code: "upload_type_rejected", retryable: false, fatal: false },
  { code: "session_not_ready", retryable: true, fatal: false },
  { code: "file_api_unavailable", retryable: false, fatal: false },
  { code: "file_not_found", retryable: false, fatal: false },
  { code: "file_access_denied", retryable: false, fatal: false },
  { code: "file_expired", retryable: false, fatal: false },
  { code: "file_operation_failed", retryable: true, fatal: false }
];

// ../cortex-sdk/js/dist/browser/errors.js
var CortexError = class extends Error {
  constructor(code, message, retryable, fatal) {
    super(message);
    this.name = "CortexError";
    this.code = code;
    this.retryable = retryable;
    this.fatal = fatal;
  }
};
var CATALOG_MAP = new Map(GENERATED_ERROR_CATALOG.map((e) => [e.code, e]));
function makeError(code, message) {
  const entry = CATALOG_MAP.get(code) ?? { code, retryable: false, fatal: false };
  return new CortexError(entry.code, message, entry.retryable, entry.fatal);
}
function lookupError(code) {
  return CATALOG_MAP.get(code);
}

// ../cortex-sdk/js/dist/browser/auth.js
function parseJwtExp(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3)
      return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(payload));
    const exp = json["exp"];
    if (typeof exp === "number")
      return exp * 1e3;
    return null;
  } catch {
    return null;
  }
}
async function exchangeApiKey(apiKey, fetchFn, authBaseUrl = DEFAULT_AUTH_URL) {
  const res = await fetchFn(buildAuthEndpoint(authBaseUrl, AUTH_TOKEN_PATH), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${apiKey}`
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = typeof body["error"] === "string" ? body["error"] : "auth_invalid";
    const message = typeof body["message"] === "string" ? body["message"] : "API key rejected";
    throw makeError(code, message);
  }
  return res.json();
}
async function refreshAccessToken(refreshToken, fetchFn, authBaseUrl = DEFAULT_AUTH_URL) {
  const res = await fetchFn(buildAuthEndpoint(authBaseUrl, AUTH_REFRESH_PATH), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${refreshToken}`
    }
  });
  if (!res.ok) {
    throw makeError("auth_refresh_failed", "Refresh token expired or invalid");
  }
  const body = await res.json();
  return body["access_token"];
}
function isTokenExpiringSoon(accessToken) {
  const expMs = parseJwtExp(accessToken);
  if (expMs === null)
    return false;
  return Date.now() > expMs - TOKEN_REFRESH_BUFFER_MS;
}
function normalizeAuthBaseUrl(authUrl) {
  let normalized = authUrl.replace(/\/+$/, "");
  for (const knownPath of [AUTH_TOKEN_PATH, AUTH_REFRESH_PATH]) {
    if (normalized.endsWith(knownPath)) {
      const base = normalized.slice(0, -knownPath.length);
      console.warn(`[CortexSDK] authUrl must be a base URL (origin only), not a full endpoint. Received "${authUrl}" \u2014 "${knownPath}" has been stripped automatically. Pass the base URL only, e.g., "${base}".`);
      normalized = base;
      break;
    }
  }
  return normalized || DEFAULT_AUTH_URL;
}
function buildAuthEndpoint(authBaseUrl, path) {
  return `${normalizeAuthBaseUrl(authBaseUrl)}${path}`;
}

// ../cortex-sdk/js/dist/browser/transport.js
function _asCloseReason(reason) {
  if (typeof reason === "string") {
    return reason;
  }
  if (reason instanceof Uint8Array) {
    try {
      return new TextDecoder().decode(reason);
    } catch {
      return "";
    }
  }
  return "";
}
function _buildOpenError(wsUrl, baseMessage, details = {}) {
  const suffix = [];
  if (typeof details.closeCode === "number") {
    suffix.push(`close_code=${details.closeCode}`);
  }
  if (details.closeReason) {
    suffix.push(`close_reason=${details.closeReason}`);
  }
  suffix.push(`ws_url=${wsUrl}`);
  const error = makeError("transport_open_failed", suffix.length ? `${baseMessage} (${suffix.join(", ")})` : baseMessage);
  error.wsUrl = wsUrl;
  error.closeCode = details.closeCode;
  error.closeReason = details.closeReason;
  error.phase = details.phase;
  return error;
}
function createTransport(WS, connectTimeoutMs) {
  let ws = null;
  const transport = {
    onMessage: null,
    onClose: null,
    onError: null,
    open(wsUrl, accessToken) {
      return new Promise((resolve, reject) => {
        const protocols = [
          WS_SUBPROTOCOL,
          `${WS_SUBPROTOCOL_JWT_PREFIX}${accessToken}`
        ];
        const socket = new WS(wsUrl, protocols);
        ws = socket;
        let settled = false;
        let opened = false;
        let openErrorMessage = "WebSocket error";
        const timer = setTimeout(() => {
          socket.close();
          if (settled) {
            return;
          }
          settled = true;
          reject(makeError("transport_connect_timeout", `WebSocket connect timed out (ws_url=${wsUrl})`));
        }, connectTimeoutMs);
        socket.onopen = () => {
          clearTimeout(timer);
          if (settled) {
            return;
          }
          opened = true;
          settled = true;
          resolve();
        };
        socket.onerror = (event) => {
          const msg = event instanceof Error ? event.message : "WebSocket error";
          openErrorMessage = msg;
          if (opened) {
            transport.onError?.(_buildOpenError(wsUrl, msg, {
              phase: "connected"
            }));
          }
        };
        socket.onclose = (event) => {
          clearTimeout(timer);
          const reason = _asCloseReason(event.reason);
          if (!opened && !settled) {
            settled = true;
            reject(_buildOpenError(wsUrl, openErrorMessage, {
              closeCode: event.code,
              closeReason: reason,
              phase: "connect"
            }));
          }
          transport.onClose?.(event.code, reason);
        };
        socket.onmessage = (event) => {
          transport.onMessage?.(event.data);
        };
      });
    },
    send(message, timeoutMs) {
      return new Promise((resolve, reject) => {
        if (!ws) {
          reject(makeError("transport_send_timeout", "No open connection"));
          return;
        }
        const timer = setTimeout(() => {
          reject(makeError("transport_send_timeout", "Send timed out"));
        }, timeoutMs);
        try {
          ws.send(JSON.stringify(message));
          clearTimeout(timer);
          resolve();
        } catch (err) {
          clearTimeout(timer);
          reject(makeError("transport_send_timeout", String(err)));
        }
      });
    },
    close(code = 1e3, reason = "disconnect") {
      ws?.close(code, reason);
      ws = null;
    }
  };
  return transport;
}

// ../cortex-sdk/js/dist/browser/liveness.js
function createLiveness(transport, pingIntervalMs, pongTimeoutMs, staleThresholdMs, callbacks) {
  let pingTimer = null;
  let pongTimer = null;
  let lastPongMs = Date.now();
  let pendingHeartbeatId = null;
  let running = false;
  function generateId() {
    return `hb_${Math.random().toString(36).slice(2, 10)}`;
  }
  function sendPing() {
    if (!running)
      return;
    if (Date.now() - lastPongMs > staleThresholdMs) {
      callbacks.onStale();
      return;
    }
    const heartbeatId = generateId();
    pendingHeartbeatId = heartbeatId;
    const sessionId = callbacks.getSessionId();
    const envelope = {
      type: "system::ping",
      schema: SCHEMA_VERSION,
      payload: {
        heartbeat_id: heartbeatId,
        channel_id: callbacks.getChannelId()
      },
      ts: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (sessionId)
      envelope["session_id"] = sessionId;
    transport.send(envelope, 5e3).catch(() => {
    });
    pongTimer = setTimeout(() => {
      if (pendingHeartbeatId === heartbeatId && running) {
        if (Date.now() - lastPongMs > staleThresholdMs) {
          callbacks.onStale();
        }
      }
    }, pongTimeoutMs);
    pingTimer = setTimeout(sendPing, pingIntervalMs);
  }
  return {
    start() {
      running = true;
      lastPongMs = Date.now();
      pingTimer = setTimeout(sendPing, pingIntervalMs);
    },
    stop() {
      running = false;
      if (pingTimer !== null) {
        clearTimeout(pingTimer);
        pingTimer = null;
      }
      if (pongTimer !== null) {
        clearTimeout(pongTimer);
        pongTimer = null;
      }
      pendingHeartbeatId = null;
    },
    handlePong(heartbeatId) {
      if (heartbeatId === pendingHeartbeatId) {
        pendingHeartbeatId = null;
        lastPongMs = Date.now();
        if (pongTimer !== null) {
          clearTimeout(pongTimer);
          pongTimer = null;
        }
      }
    }
  };
}

// ../cortex-sdk/js/dist/browser/session.js
var TERMINAL_STATES = /* @__PURE__ */ new Set([
  "COMPLETED",
  "FAILED",
  "STOPPED",
  "TIMEOUT",
  "CANCELLED"
]);
var LIFECYCLE_STATE_MAP = {
  active: "ACTIVE",
  waiting: "WAITING",
  completed: "COMPLETED",
  failed: "FAILED",
  stopped: "STOPPED",
  timeout: "TIMEOUT",
  cancelled: "CANCELLED"
};
function createSession(callbacks) {
  let _sessionId = null;
  let _sessionState = "CREATED";
  let _lastSeq = 0;
  let _transport = null;
  let _sendTimeoutMs = 1e4;
  let _tenantId = null;
  function setSessionState(next) {
    if (TERMINAL_STATES.has(_sessionState) && _sessionState !== next) {
      return;
    }
    _sessionState = next;
  }
  function updateSessionStateFromMessage(msg) {
    if (msg.type === "sandbox::snapshot") {
      const state = typeof msg.payload["state"] === "string" ? msg.payload["state"].toLowerCase() : null;
      if (state === "waiting") {
        setSessionState("WAITING");
      }
      return;
    }
    if (msg.type === "sandbox::lifecycle") {
      const status = typeof msg.payload["status"] === "string" ? msg.payload["status"].toLowerCase() : null;
      if (status && status in LIFECYCLE_STATE_MAP) {
        setSessionState(LIFECYCLE_STATE_MAP[status]);
      }
      return;
    }
    if (msg.type === "system::error") {
      const code = typeof msg.payload["code"] === "string" ? msg.payload["code"] : "session_terminal";
      if (lookupError(code)?.fatal) {
        setSessionState("FAILED");
      }
    }
  }
  function send(envelope) {
    if (!_transport)
      return Promise.reject(new Error("No transport"));
    return _transport.send(envelope, _sendTimeoutMs);
  }
  function buildEnvelope(type, payload) {
    const env = {
      type,
      schema: SCHEMA_VERSION,
      payload,
      ts: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (_sessionId)
      env["session_id"] = _sessionId;
    return env;
  }
  function makeClientMsgId(prefix) {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
      return `${prefix}_${cryptoRef.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }
  function buildMessagePayload(content, attachments, meta) {
    const payload = { content, role: "user" };
    const combinedMeta = {};
    if (meta)
      Object.assign(combinedMeta, meta);
    if (attachments && attachments.length > 0)
      combinedMeta["attachments"] = attachments;
    if (Object.keys(combinedMeta).length > 0)
      payload["meta"] = combinedMeta;
    return payload;
  }
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function validateEscalationReply(escalationId, waitToken, action, content) {
    if (typeof escalationId !== "string" || escalationId.trim() === "") {
      throw makeError("transport_protocol_violation", "escalationId is required");
    }
    if (typeof waitToken !== "string" || waitToken.trim() === "") {
      throw makeError("transport_protocol_violation", "waitToken is required");
    }
    if (action !== "continue" && action !== "operator_input" && action !== "reply_user") {
      throw makeError("transport_protocol_violation", `Unsupported escalation reply action: ${action}`);
    }
    if (action === "continue" && content === void 0) {
      return;
    }
    if (typeof content === "string") {
      return;
    }
    if (isPlainObject(content)) {
      return;
    }
    throw makeError("transport_protocol_violation", `content must be a string or object for escalation action ${action}`);
  }
  function buildEscalationReplyPayload(escalationId, waitToken, action, content, meta) {
    validateEscalationReply(escalationId, waitToken, action, content);
    const payload = {
      escalation_id: escalationId.trim(),
      action,
      wait_token: waitToken.trim()
    };
    if (content !== void 0) {
      payload["content"] = content;
    }
    if (meta !== void 0) {
      payload["meta"] = meta;
    }
    return payload;
  }
  function handleSystemError(payload) {
    const code = typeof payload["code"] === "string" ? payload["code"] : "session_terminal";
    const message = typeof payload["message"] === "string" ? payload["message"] : "Runtime error";
    const entry = lookupError(code);
    const fatal = entry?.fatal ?? false;
    const err = makeError(code, message);
    if (fatal) {
      callbacks.onFatalError(err);
    }
  }
  return {
    setTenantId(tenantId) {
      const normalized = typeof tenantId === "string" ? tenantId.trim() : "";
      _tenantId = normalized || null;
    },
    setTransport(transport, sendTimeoutMs) {
      _transport = transport;
      _sendTimeoutMs = sendTimeoutMs;
    },
    get sessionId() {
      return _sessionId;
    },
    get sessionState() {
      return _sessionState;
    },
    get lastSeq() {
      return _lastSeq;
    },
    sendInit(bootstrap) {
      _sessionState = "INITIALIZING";
      const envelope = {
        type: "system::init",
        schema: SCHEMA_VERSION,
        payload: bootstrap,
        meta: { client_msg_id: makeClientMsgId("cli_init") },
        ts: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (_tenantId)
        envelope["tenant_id"] = _tenantId;
      return send(envelope);
    },
    sendResync() {
      return send(buildEnvelope("system::resync", { last_seq: _lastSeq }));
    },
    sendStop() {
      return send(buildEnvelope("sandbox::stop", {}));
    },
    sendChatMessage(content, attachments, meta) {
      return send(buildEnvelope("chat::message", buildMessagePayload(content, attachments, meta)));
    },
    sendEscalationReply(escalationId, waitToken, action, content, meta) {
      return send(buildEnvelope("escalation::reply", buildEscalationReplyPayload(escalationId, waitToken, action, content, meta)));
    },
    sendSystemTrigger(content, attachments) {
      const payload = { content };
      if (attachments && attachments.length > 0) {
        payload["meta"] = { attachments };
      }
      return send(buildEnvelope("system::trigger", payload));
    },
    sendTrigger(payload) {
      return send({
        type: "system::trigger",
        schema: SCHEMA_VERSION,
        payload: payload || {},
        meta: { client_msg_id: makeClientMsgId("cli_trigger") },
        ts: (/* @__PURE__ */ new Date()).toISOString()
      });
    },
    handleIncoming(data) {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (!_sessionId && msg.session_id) {
        _sessionId = msg.session_id;
        if (!TERMINAL_STATES.has(_sessionState)) {
          _sessionState = "ACTIVE";
        }
      }
      if (typeof msg.seq === "number" && msg.seq > _lastSeq) {
        _lastSeq = msg.seq;
      }
      updateSessionStateFromMessage(msg);
      if (msg.type === "system::error") {
        handleSystemError(msg.payload);
      }
      callbacks.onMessage(msg);
    }
  };
}

// ../cortex-sdk/js/dist/browser/upload.js
async function uploadFile(file, accessToken, uploadUrl, fetchFn, FormDataClass) {
  const formData = new FormDataClass();
  let blob;
  if (typeof file === "string") {
    throw new Error("File path upload is not supported in browser entry \u2014 use Blob or ArrayBuffer");
  } else if (file instanceof ArrayBuffer) {
    blob = new Blob([file]);
  } else if (ArrayBuffer.isView(file)) {
    blob = new Blob([file.buffer]);
  } else {
    blob = file;
  }
  formData.append("file", blob, "upload");
  const res = await fetchFn(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
      // Content-Type is set automatically with boundary when using FormData
    },
    body: formData
    // fetchFn accepts FormData via unknown cast
  });
  if (!res.ok) {
    if (res.status === 413) {
      throw makeError("upload_too_large", "File exceeds the allowed size limit");
    }
    if (res.status === 415) {
      throw makeError("upload_type_rejected", "File type not accepted by the runtime");
    }
    throw makeError("upload_failed", `Upload failed with status ${res.status}`);
  }
  const body = await res.json();
  const fileId = body["file_id"] ?? body["attachment_id"];
  if (typeof fileId !== "string") {
    throw makeError("upload_failed", "Upload response did not include file_id");
  }
  return fileId;
}

// ../cortex-sdk/js/dist/browser/client.js
var CortexClient = class {
  constructor(options, platform) {
    this._messageHandlers = /* @__PURE__ */ new Set();
    this._channelState = "CLOSED";
    this._accessToken = null;
    this._refreshToken = null;
    this._wsUrl = null;
    this._runtimeHttpBaseUrl = null;
    this._cpApiUrl = null;
    this._channelId = `ch_${Math.random().toString(36).slice(2, 10)}`;
    this._reconnectAttempt = 0;
    this._disconnectRequested = false;
    this._liveness = null;
    this._tokenRefreshTimer = null;
    this._pendingDelayCancels = /* @__PURE__ */ new Set();
    this._reconnectLoopPromise = null;
    const authUrl = normalizeAuthBaseUrl(options.authUrl ?? DEFAULT_AUTH_URL);
    this._options = {
      connectTimeout: DEFAULT_CONNECT_TIMEOUT_MS,
      sendTimeout: DEFAULT_SEND_TIMEOUT_MS,
      resyncTimeout: DEFAULT_RESYNC_TIMEOUT_MS,
      pingInterval: DEFAULT_PING_INTERVAL_MS,
      pongTimeout: DEFAULT_PONG_TIMEOUT_MS,
      staleThreshold: DEFAULT_STALE_THRESHOLD_MS,
      ...options,
      authUrl
    };
    this._platform = platform;
    this._transport = createTransport(platform.WS, this._options.connectTimeout);
    this._session = createSession({
      onMessage: (msg) => {
        if (msg.type === "system::pong" && typeof msg.payload["heartbeat_id"] === "string") {
          this._liveness?.handlePong(msg.payload["heartbeat_id"]);
          return;
        }
        this._dispatchMessage(msg);
      },
      onFatalError: (err) => {
        this._channelState = "AUTH_FAILED";
        this._stopBackgroundActivity();
        this._transport.close();
        this._dispatchMessage({
          type: "system::error",
          schema: "1.0",
          session_id: this._session.sessionId ?? "",
          payload: { code: err.code, message: err.message },
          ts: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    });
    this._transport.onMessage = (data) => this._session.handleIncoming(data);
    this._transport.onClose = (code, reason) => this._handleClose(code, reason);
    this._transport.onError = () => {
    };
  }
  get sessionState() {
    return this._session.sessionState;
  }
  get channelState() {
    return this._channelState;
  }
  get sessionId() {
    return this._session.sessionId;
  }
  onMessage(handler) {
    this._messageHandlers.add(handler);
    return () => {
      this._messageHandlers.delete(handler);
    };
  }
  async connect() {
    this._disconnectRequested = false;
    this._reconnectAttempt = 0;
    const authResponse = await exchangeApiKey(this._options.apiKey, this._platform.fetchFn, this._options.authUrl);
    this._accessToken = authResponse.access_token;
    this._refreshToken = authResponse.refresh_token;
    this._wsUrl = authResponse.ws_url;
    this._runtimeHttpBaseUrl = deriveRuntimeHttpBaseUrl(authResponse.ws_url);
    this._runtimeHttpBaseUrl = deriveRuntimeHttpBaseUrlFromHttpUrl(this._platform.uploadUrl) ?? this._runtimeHttpBaseUrl;
    this._cpApiUrl = normalizeOptionalBaseUrl(authResponse.cp_api_url);
    await this._openChannel();
    this._session.setTransport(this._transport, this._options.sendTimeout);
    await this._session.sendInit(authResponse.runtime_bootstrap);
    this._liveness = createLiveness(this._transport, this._options.pingInterval, this._options.pongTimeout, this._options.staleThreshold, {
      onStale: () => this._handleStale(),
      getSessionId: () => this._session.sessionId,
      getChannelId: () => this._channelId
    });
    this._liveness.start();
    this._scheduleTokenRefresh();
  }
  async disconnect() {
    this._disconnectRequested = true;
    this._stopBackgroundActivity();
    this._channelState = "CLOSED";
    this._transport.close();
  }
  async sendMessage(options) {
    await this._session.sendChatMessage(options.content, options.attachments, options.meta);
  }
  async replyEscalation(options) {
    this._requireSessionId();
    await this._session.sendEscalationReply(options.escalationId, options.waitToken, options.action, options.content, options.meta);
  }
  async uploadFile(file, options = {}) {
    if (!this._accessToken)
      throw makeError("auth_invalid", "Not connected");
    const sessionId = this._requireSessionId(options.sessionId);
    return uploadFile(file, this._accessToken, withQueryParams(this._resolveRuntimeUrl(this._platform.uploadUrl), { session_id: sessionId }), this._platform.fetchFn, this._platform.FormDataClass);
  }
  async uploadAttachment(file) {
    return this.uploadFile(file);
  }
  async downloadFile(fileId, options = {}) {
    if (!this._accessToken)
      throw makeError("auth_invalid", "Not connected");
    const scope = options.scope ?? "session";
    let url;
    if (scope === "session") {
      const sessionId = this._requireSessionId(options.sessionId);
      url = `${this._requireRuntimeHttpBaseUrl()}/download/${encodeURIComponent(fileId)}`;
      url = withQueryParams(url, { session_id: sessionId });
    } else if (scope === "project") {
      if (options.projectId === void 0) {
        throw makeError("file_operation_failed", "projectId is required for project file download");
      }
      url = `${this._requireCpApiUrl()}/api/workspace/projects/${encodeURIComponent(String(options.projectId))}/files/${encodeURIComponent(fileId)}/download/`;
    } else {
      throw makeError("file_operation_failed", `Unsupported file scope: ${scope}`);
    }
    const res = await this._request(url, "GET");
    if (typeof res.blob === "function") {
      return res.blob();
    }
    if (typeof res.arrayBuffer === "function") {
      return new Blob([await res.arrayBuffer()]);
    }
    throw makeError("file_operation_failed", "File API response does not expose bytes");
  }
  async listFiles(options = {}) {
    if (!this._accessToken)
      throw makeError("auth_invalid", "Not connected");
    const scope = options.scope ?? "session";
    const query = {
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      include_trashed: String(options.includeTrashed ?? false)
    };
    let url;
    if (scope === "session") {
      const sessionId = this._requireSessionId(options.sessionId);
      url = `${this._requireRuntimeHttpBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/files/`;
    } else if (scope === "project") {
      if (options.projectId === void 0) {
        throw makeError("file_operation_failed", "projectId is required for project file list");
      }
      url = `${this._requireCpApiUrl()}/api/workspace/projects/${encodeURIComponent(String(options.projectId))}/files/`;
    } else {
      throw makeError("file_operation_failed", `Unsupported file scope: ${scope}`);
    }
    const body = await this._requestJson(withQueryParams(url, query));
    return body;
  }
  async promoteFile(fileId, options) {
    if (!this._accessToken)
      throw makeError("auth_invalid", "Not connected");
    const url = `${this._requireCpApiUrl()}/api/workspace/projects/${encodeURIComponent(String(options.projectId))}/files/${encodeURIComponent(fileId)}/promote/`;
    const body = await this._requestJson(url, "POST");
    return body;
  }
  async stop() {
    await this._session.sendStop();
  }
  async _openChannel() {
    if (!this._wsUrl || !this._accessToken)
      throw new Error("Auth not completed");
    this._channelState = "CONNECTING";
    await this._transport.open(this._wsUrl, this._accessToken);
    this._channelState = "OPEN";
    this._reconnectAttempt = 0;
  }
  _handleStale() {
    if (this._channelState === "STALE" || this._channelState === "RECONNECTING")
      return;
    this._channelState = "STALE";
    this._liveness?.stop();
    this._transport.close(1001, "stale");
  }
  _handleClose(code, reason) {
    if (this._disconnectRequested)
      return;
    if (this._channelState === "AUTH_FAILED")
      return;
    if (code === 4001) {
      this._channelState = "AUTH_FAILED";
      this._stopBackgroundActivity();
      return;
    }
    this._channelState = "RECONNECTING";
    if (!this._reconnectLoopPromise) {
      this._reconnectLoopPromise = this._reconnectLoop().finally(() => {
        this._reconnectLoopPromise = null;
      });
    }
  }
  async _reconnectLoop() {
    while (!this._shouldStopReconnect()) {
      const backoffMs = RECONNECT_BACKOFF_MS[Math.min(this._reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)] ?? 3e4;
      this._reconnectAttempt++;
      const backoffDelay = this._createCancelableDelay(backoffMs);
      const backoffElapsed = await backoffDelay.promise;
      if (backoffElapsed === CANCELLED || this._shouldStopReconnect()) {
        break;
      }
      try {
        await this._maybeRefreshToken();
      } catch {
        this._channelState = "AUTH_FAILED";
        return;
      }
      try {
        await this._openChannel();
      } catch {
        continue;
      }
      this._session.setTransport(this._transport, this._options.sendTimeout);
      const resyncTimeout = this._createCancelableDelay(this._options.resyncTimeout);
      try {
        const resyncOutcome = await Promise.race([
          this._session.sendResync().then(() => "resynced"),
          resyncTimeout.promise.then((outcome) => outcome === CANCELLED ? "cancelled" : "timed_out")
        ]);
        if (resyncOutcome === "cancelled") {
          return;
        }
        if (resyncOutcome === "timed_out") {
          throw makeError("resync_timeout", "Resync timed out");
        }
      } catch {
        this._transport.close();
        continue;
      } finally {
        resyncTimeout.cancel();
      }
      this._liveness?.stop();
      this._liveness = createLiveness(this._transport, this._options.pingInterval, this._options.pongTimeout, this._options.staleThreshold, {
        onStale: () => this._handleStale(),
        getSessionId: () => this._session.sessionId,
        getChannelId: () => this._channelId
      });
      this._liveness.start();
      this._scheduleTokenRefresh();
      return;
    }
  }
  async _maybeRefreshToken() {
    if (!this._refreshToken)
      throw makeError("auth_refresh_failed", "No refresh token");
    if (!this._accessToken || isTokenExpiringSoon(this._accessToken)) {
      this._accessToken = await refreshAccessToken(this._refreshToken, this._platform.fetchFn, this._options.authUrl);
    }
  }
  _scheduleTokenRefresh() {
    this._stopTokenRefreshTimer();
    if (!this._accessToken)
      return;
    this._tokenRefreshTimer = setInterval(async () => {
      if (this._accessToken && isTokenExpiringSoon(this._accessToken) && this._refreshToken) {
        try {
          this._accessToken = await refreshAccessToken(this._refreshToken, this._platform.fetchFn, this._options.authUrl);
        } catch {
        }
      }
    }, TOKEN_REFRESH_BUFFER_MS / 2);
  }
  _stopTokenRefreshTimer() {
    if (this._tokenRefreshTimer !== null) {
      clearInterval(this._tokenRefreshTimer);
      this._tokenRefreshTimer = null;
    }
  }
  _stopBackgroundActivity() {
    this._liveness?.stop();
    this._stopTokenRefreshTimer();
    this._cancelPendingDelays();
  }
  _dispatchMessage(message) {
    try {
      this._options.onMessage(message);
    } catch {
    }
    const handlers = Array.from(this._messageHandlers);
    for (const handler of handlers) {
      try {
        handler(message);
      } catch {
      }
    }
  }
  _shouldStopReconnect() {
    return this._disconnectRequested || this._channelState === "AUTH_FAILED";
  }
  _createCancelableDelay(ms) {
    let settled = false;
    let resolveDelay = () => {
    };
    const promise = new Promise((resolve) => {
      resolveDelay = resolve;
    });
    const cancel = () => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      this._pendingDelayCancels.delete(cancel);
      resolveDelay(CANCELLED);
    };
    const timer = setTimeout(() => {
      if (settled)
        return;
      settled = true;
      this._pendingDelayCancels.delete(cancel);
      resolveDelay(true);
    }, ms);
    this._pendingDelayCancels.add(cancel);
    return { promise, cancel };
  }
  _cancelPendingDelays() {
    for (const cancel of Array.from(this._pendingDelayCancels)) {
      cancel();
    }
  }
  _requireSessionId(sessionId) {
    const effectiveSessionId = sessionId ?? this.sessionId;
    if (!effectiveSessionId) {
      throw makeError("session_not_ready", "Session is not ready");
    }
    return effectiveSessionId;
  }
  _requireRuntimeHttpBaseUrl() {
    if (!this._runtimeHttpBaseUrl) {
      throw makeError("file_api_unavailable", "Runtime file API is unavailable");
    }
    return this._runtimeHttpBaseUrl;
  }
  _requireCpApiUrl() {
    if (!this._cpApiUrl) {
      throw makeError("file_api_unavailable", "Control Plane file API is unavailable");
    }
    return this._cpApiUrl;
  }
  _resolveRuntimeUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl))
      return pathOrUrl;
    return `${this._requireRuntimeHttpBaseUrl()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  }
  async _requestJson(url, method = "GET") {
    const res = await this._request(url, method);
    const body = await res.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw makeError("file_operation_failed", "File API returned a non-object response");
    }
    return body;
  }
  async _request(url, method) {
    if (!this._accessToken)
      throw makeError("auth_invalid", "Not connected");
    const res = await this._platform.fetchFn(url, {
      method,
      headers: { Authorization: `Bearer ${this._accessToken}` }
    });
    if (!res.ok) {
      throw mapFileResponseError(res.status);
    }
    return res;
  }
};
var CANCELLED = Symbol("cancelled");
function deriveRuntimeHttpBaseUrl(wsUrl) {
  if (!wsUrl)
    return null;
  const parsed = new URL(wsUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : parsed.protocol === "ws:" ? "http:" : parsed.protocol;
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}
function deriveRuntimeHttpBaseUrlFromHttpUrl(httpUrl) {
  if (!/^https?:\/\//i.test(httpUrl))
    return null;
  const parsed = new URL(httpUrl);
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}
function normalizeOptionalBaseUrl(url) {
  if (typeof url !== "string" || url.trim() === "")
    return null;
  return url.replace(/\/$/, "");
}
function withQueryParams(url, params) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, String(value));
  }
  return parsed.toString();
}
function mapFileResponseError(status) {
  if (status === 401)
    return makeError("auth_invalid", "File API authentication failed");
  if (status === 403)
    return makeError("file_access_denied", "File access denied");
  if (status === 404)
    return makeError("file_not_found", "File not found");
  if (status === 410)
    return makeError("file_expired", "File expired");
  return makeError("file_operation_failed", `File operation failed with status ${status}`);
}

// ../cortex-sdk/js/dist/browser/index.js
var UPLOAD_URL = "/upload";
function makePlatform() {
  return {
    WS: WebSocket,
    fetchFn: (url, init) => fetch(url, init),
    FormDataClass: FormData,
    uploadUrl: UPLOAD_URL
  };
}
var CortexBrowserClient = class extends CortexClient {
  constructor(options) {
    super(options, makePlatform());
  }
};

// src/errors.ts
var WidgetError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "WidgetError";
    this.code = code;
    this.cause = cause;
  }
};
function createWidgetError(code, message, cause) {
  return new WidgetError(code, message, cause);
}
function toWidgetError(error, fallbackCode = "widget_error", fallbackMessage = "Unexpected widget error") {
  if (error instanceof WidgetError) {
    return {
      code: error.code,
      message: error.message,
      cause: error.cause
    };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message,
      cause: error
    };
  }
  return {
    code: fallbackCode,
    message: fallbackMessage,
    cause: error
  };
}

// src/icons.ts
var ICONS = {
  "paperclip": `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 1 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0z"/></svg>`,
  "send-fill": `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 0 0-.082.887l.41.26.001.002 4.995 3.178 3.178 4.995.002.002.26.41a.5.5 0 0 0 .886-.083zm-1.833 1.89L6.637 10.07l-.215-.338a.5.5 0 0 0-.154-.154l-.338-.215 7.494-7.494 1.178-.471z"/></svg>`,
  "reply-fill": `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.921 11.9 1.353 8.62a.719.719 0 0 1 0-1.238L5.921 4.1A.716.716 0 0 1 7 4.719V6c1.5 0 6 0 7 8-2.5-4.5-7-4-7-4v1.281c0 .56-.606.898-1.079.62z"/></svg>`,
  "arrow-clockwise": `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>`
};
function getIconSvg(name) {
  return ICONS[name];
}

// src/styles.ts
var widgetStyles = `
:host {
  color-scheme: light;
}

.cortex-widget {
  --cortex-accent-color: #2563eb;
  --cortex-background-color: #ffffff;
  --cortex-text-color: #172033;
  --cortex-border-radius: 18px;
  color: var(--cortex-text-color);
  font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
  line-height: 1.4;
}

.cortex-widget *,
.cortex-widget *::before,
.cortex-widget *::after {
  box-sizing: border-box;
}

.cortex-widget[data-mode="floating"] {
  position: fixed;
  bottom: 20px;
  z-index: 2147483000;
}

.cortex-widget[data-position="bottom-right"] {
  right: 20px;
}

.cortex-widget[data-position="bottom-left"] {
  left: 20px;
}

.cortex-widget__launcher {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  height: 56px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--cortex-accent-color), #0f172a);
  color: #ffffff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  padding: 0 18px;
}

.cortex-widget__panel {
  width: min(380px, calc(100vw - 24px));
  height: min(680px, calc(100vh - 96px));
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 38%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.98), var(--cortex-background-color));
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--cortex-border-radius);
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
}

.cortex-widget__panel[hidden] {
  display: none;
}

.cortex-widget[data-mode="floating"] .cortex-widget__panel {
  margin-bottom: 12px;
}

.cortex-widget__header {
  padding: 18px 18px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px);
}

.cortex-widget__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.cortex-widget__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #475569;
}

.cortex-widget__status {
  margin: 8px 0 0;
  font-size: 12px;
  color: #334155;
}

.cortex-widget__body {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.cortex-widget__error {
  display: none;
  margin: 12px 18px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #9f1239;
  font-size: 13px;
}

.cortex-widget__error[data-visible="true"] {
  display: block;
}

.cortex-widget__transcript {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cortex-widget__empty {
  color: #64748b;
  font-size: 13px;
  text-align: center;
  padding: 24px 12px;
}

.cortex-widget__message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cortex-widget__message[data-role="user"] {
  align-items: flex-end;
}

.cortex-widget__message[data-role="assistant"],
.cortex-widget__message[data-role="system"],
.cortex-widget__message[data-role="error"],
.cortex-widget__message[data-role="operator"],
.cortex-widget__message[data-role="escalation"] {
  align-items: flex-start;
}

.cortex-widget__bubble {
  max-width: 88%;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.92);
  color: var(--cortex-text-color);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  white-space: pre-wrap;
  word-break: break-word;
}

.cortex-widget__bubble-text {
  white-space: pre-wrap;
}

.cortex-widget__message[data-role="user"] .cortex-widget__bubble {
  background: linear-gradient(135deg, var(--cortex-accent-color), #1d4ed8);
  color: #ffffff;
}

.cortex-widget__message[data-role="assistant"] .cortex-widget__bubble[data-status="streaming"]::after {
  content: " \xB7\xB7\xB7";
  opacity: 0.75;
}

.cortex-widget__message[data-role="error"] .cortex-widget__bubble {
  border-color: #fecdd3;
  background: #fff1f2;
  color: #9f1239;
}

.cortex-widget__message[data-role="escalation"] .cortex-widget__bubble {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.cortex-widget__meta {
  font-size: 11px;
  color: #64748b;
}

.cortex-widget__formatted {
  margin: 0;
  white-space: pre-wrap;
  font-size: 12px;
  font-family: Consolas, "Courier New", monospace;
}

.cortex-widget__message-attachments {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
}

.cortex-widget__message-attachment {
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  border: 1px solid rgba(148, 163, 184, 0.24);
  font-size: 12px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-widget__message-attachment-link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: inherit;
  text-decoration: none;
}

.cortex-widget__message-attachment-link:hover {
  text-decoration: underline;
}

.cortex-widget__message-attachment-label {
  font-weight: 600;
}

.cortex-widget__message-attachment-details {
  font-size: 11px;
  opacity: 0.82;
}

.cortex-widget__message[data-role="user"] .cortex-widget__message-attachment {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.28);
  color: #ffffff;
}

.cortex-widget__worker-status {
  display: none;
  margin: 0 18px 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--cortex-text-color);
  opacity: 0.65;
}

.cortex-widget__worker-status[data-visible="true"] {
  display: block;
}

.cortex-widget__worker-status[data-state="error"] {
  color: #dc2626;
  opacity: 1;
}

.cortex-widget__typing,
.cortex-widget__escalation {
  display: none;
  margin: 0 18px 12px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
}

.cortex-widget__typing[data-visible="true"] {
  display: block;
  background: #eff6ff;
  color: #1d4ed8;
}

.cortex-widget__escalation[data-visible="true"] {
  display: block;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

.cortex-widget__composer {
  padding: 14px 18px 18px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.94);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cortex-widget__textarea {
  width: 100%;
  min-height: 92px;
  resize: vertical;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: #ffffff;
  color: var(--cortex-text-color);
  font: inherit;
  outline: none;
}

.cortex-widget__textarea:focus {
  border-color: rgba(37, 99, 235, 0.55);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.cortex-widget__textarea:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

.cortex-widget__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cortex-widget__attach-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cortex-widget__attach,
.cortex-widget__send,
.cortex-widget__file-remove {
  border: 0;
  border-radius: 12px;
  font: inherit;
  cursor: pointer;
}

.cortex-widget__attach,
.cortex-widget__file-remove {
  background: #eff6ff;
  color: #1d4ed8;
  padding: 9px 12px;
}

.cortex-widget__send {
  background: linear-gradient(135deg, var(--cortex-accent-color), #1d4ed8);
  color: #ffffff;
  padding: 10px 16px;
  font-weight: 600;
  min-width: 92px;
}

.cortex-widget__attach:disabled,
.cortex-widget__send:disabled,
.cortex-widget__file-remove:disabled,
.cortex-widget__launcher:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.cortex-widget__file-input {
  display: none;
}

.cortex-widget__file-hint {
  font-size: 12px;
  color: #64748b;
}

.cortex-widget__file-chip {
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.cortex-widget__file-chip[data-visible="true"] {
  display: flex;
}

.cortex-widget__file-chip-main {
  min-width: 0;
}

.cortex-widget__file-chip-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cortex-widget__file-chip-meta {
  display: block;
  font-size: 12px;
  color: #64748b;
}

.cortex-widget__actor {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.cortex-widget__actor-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: #e2e8f0;
}

.cortex-widget__actor-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cortex-widget__actor-name {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.cortex-widget__actor-title {
  font-size: 11px;
  color: #64748b;
}

.cortex-widget__question-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.cortex-widget__question-option {
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid rgba(37, 99, 235, 0.45);
  background: #eff6ff;
  color: #1d4ed8;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.cortex-widget__question-option:hover:not(:disabled) {
  background: #dbeafe;
  border-color: rgba(37, 99, 235, 0.65);
}

.cortex-widget__question-option:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 520px) {
  .cortex-widget[data-mode="floating"] {
    left: 12px;
    right: 12px;
    bottom: 12px;
  }

  .cortex-widget[data-mode="floating"][data-position="bottom-left"],
  .cortex-widget[data-mode="floating"][data-position="bottom-right"] {
    left: 12px;
    right: 12px;
  }

  .cortex-widget__panel {
    width: 100%;
    height: min(74vh, 640px);
  }

  .cortex-widget__launcher {
    width: 100%;
  }
}

.cortex-widget__attach,
.cortex-widget__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s, background 0.15s;
}

.cortex-widget__attach {
  background: #e2e8f0;
  color: #475569;
}

.cortex-widget__attach:hover:not(:disabled) {
  background: #cbd5e1;
}

.cortex-widget__send {
  background: var(--cortex-accent-color);
  color: #ffffff;
}

.cortex-widget__send:hover:not(:disabled) {
  opacity: 0.88;
}

.cortex-widget__attach:disabled,
.cortex-widget__send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.cortex-widget__attach svg,
.cortex-widget__send svg {
  width: 16px;
  height: 16px;
  pointer-events: none;
}

.cortex-widget__message-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72em;
  color: #64748b;
  margin-top: 2px;
}

.cortex-widget__message-status[data-status="failed"] {
  color: #dc2626;
}

.cortex-widget__message-status[data-status="sending"] {
  opacity: 0.7;
}

.cortex-widget__message-retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.cortex-widget__message-retry:hover {
  background: rgba(220, 38, 38, 0.1);
}

.cortex-widget__message-retry svg {
  width: 12px;
  height: 12px;
  pointer-events: none;
}
`;

// src/dom.ts
function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (textContent !== void 0) {
    element.textContent = textContent;
  }
  return element;
}
function createWidgetDom(options) {
  const host = createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = createElement("style");
  style.textContent = widgetStyles;
  const root = createElement("div", "cortex-widget");
  root.dataset.mode = options.mode;
  root.dataset.position = options.position;
  const launcher = createElement("button", "cortex-widget__launcher", options.launcherLabel);
  launcher.type = "button";
  launcher.setAttribute("data-testid", "launcher");
  const panel = createElement("section", "cortex-widget__panel");
  panel.setAttribute("data-testid", "panel");
  const header = createElement("header", "cortex-widget__header");
  const title = createElement("h2", "cortex-widget__title", options.title);
  const subtitle = createElement("p", "cortex-widget__subtitle", options.subtitle);
  const status = createElement("p", "cortex-widget__status", "");
  const body = createElement("div", "cortex-widget__body");
  const errorBanner = createElement("div", "cortex-widget__error");
  errorBanner.setAttribute("role", "alert");
  errorBanner.setAttribute("data-testid", "error-banner");
  const transcript = createElement("div", "cortex-widget__transcript");
  transcript.setAttribute("data-testid", "transcript");
  const workerStatus = createElement("div", "cortex-widget__worker-status");
  workerStatus.setAttribute("data-testid", "worker-status");
  const typing = createElement("div", "cortex-widget__typing");
  typing.setAttribute("data-testid", "typing-indicator");
  const escalation = createElement("div", "cortex-widget__escalation");
  escalation.setAttribute("data-testid", "escalation-card");
  const composer = createElement("form", "cortex-widget__composer");
  composer.setAttribute("data-testid", "composer");
  const textarea = createElement("textarea", "cortex-widget__textarea");
  textarea.placeholder = options.placeholder;
  textarea.setAttribute("data-testid", "composer-textarea");
  const fileChip = createElement("div", "cortex-widget__file-chip");
  fileChip.setAttribute("data-testid", "selected-file-chip");
  const fileChipMain = createElement("div", "cortex-widget__file-chip-main");
  const fileChipName = createElement("span", "cortex-widget__file-chip-name");
  const fileChipMeta = createElement("span", "cortex-widget__file-chip-meta");
  const fileChipRemove = createElement("button", "cortex-widget__file-remove", "Remove");
  fileChipRemove.type = "button";
  fileChipRemove.setAttribute("data-testid", "remove-file");
  fileChipMain.append(fileChipName, fileChipMeta);
  fileChip.append(fileChipMain, fileChipRemove);
  const actions = createElement("div", "cortex-widget__actions");
  const attachWrap = createElement("div", "cortex-widget__attach-wrap");
  const fileInput = createElement("input", "cortex-widget__file-input");
  fileInput.type = "file";
  fileInput.setAttribute("data-testid", "file-input");
  const attachButton = createElement("button", "cortex-widget__attach");
  attachButton.type = "button";
  attachButton.setAttribute("aria-label", "Attach file");
  attachButton.setAttribute("title", "Attach file");
  attachButton.setAttribute("data-testid", "attach-button");
  attachButton.innerHTML = getIconSvg("paperclip");
  const fileHint = createElement("span", "cortex-widget__file-hint");
  fileHint.setAttribute("data-testid", "file-hint");
  const sendButton = createElement("button", "cortex-widget__send");
  sendButton.type = "submit";
  sendButton.setAttribute("aria-label", "Send message");
  sendButton.setAttribute("title", "Send message");
  sendButton.setAttribute("data-testid", "send-button");
  sendButton.innerHTML = getIconSvg("send-fill");
  attachWrap.append(fileInput, attachButton, fileHint);
  actions.append(attachWrap, sendButton);
  composer.append(textarea, fileChip, actions);
  header.append(title, subtitle, status);
  body.append(errorBanner, transcript, workerStatus, typing, escalation, composer);
  panel.append(header, body);
  if (options.mode === "floating") {
    root.append(panel, launcher);
  } else {
    root.append(panel);
  }
  shadowRoot.append(style, root);
  return {
    host,
    shadowRoot,
    launcher,
    panel,
    title,
    subtitle,
    status,
    errorBanner,
    transcript,
    workerStatus,
    typing,
    escalation,
    composer,
    textarea,
    sendButton,
    attachButton,
    fileInput,
    fileHint,
    fileChip,
    fileChipName,
    fileChipMeta,
    fileChipRemove
  };
}

// ../cortex-sdk-ui/dist/src/errors.js
var ControllerError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "ControllerError";
    this.code = code;
    this.details = details;
  }
};
function createChatError(code, message, source, details) {
  return { code, message, source, details };
}
function createControllerError(code, message, source, details) {
  return new ControllerError(code, message, {
    ...source ? { source } : {},
    ...details ?? {}
  });
}
function errorFromUnknown(error, fallbackCode = "controller_error", source) {
  if (error instanceof ControllerError) {
    return createChatError(error.code, error.message, source, error.details);
  }
  if (error instanceof Error) {
    return createChatError(fallbackCode, error.message, source);
  }
  return createChatError(fallbackCode, "Unknown controller error", source, {
    value: error
  });
}

// ../cortex-sdk-ui/dist/src/utils.js
var TERMINAL_SESSION_STATES = /* @__PURE__ */ new Set([
  "COMPLETED",
  "FAILED",
  "STOPPED",
  "TIMEOUT",
  "CANCELLED"
]);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asPayload(message) {
  return isRecord(message.payload) ? message.payload : {};
}
function asNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
function asStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => typeof entry === "string" ? entry.trim() : "").filter((entry) => entry !== "");
}
function buildMessageId(message, fallbackPrefix) {
  const payload = asPayload(message);
  const turnId = asNonEmptyString(payload["turn_id"]);
  if (turnId && (message.type === "chat::partial" || message.type === "chat::answer")) {
    return `turn:${turnId}`;
  }
  const escalationId = asNonEmptyString(payload["escalation_id"]);
  if (escalationId && message.type === "escalation::request") {
    return `escalation:${escalationId}`;
  }
  if (escalationId && message.type === "escalation::reply") {
    const action = asNonEmptyString(payload["action"]) ?? "reply";
    const seqSuffix = typeof message.seq === "number" ? String(message.seq) : asNonEmptyString(message.ts) ?? "unknown";
    return `escalation-reply:${escalationId}:${action}:${seqSuffix}`;
  }
  if (typeof message.seq === "number") {
    return `seq:${message.seq}`;
  }
  if (asNonEmptyString(message.session_id) && asNonEmptyString(message.ts)) {
    return `${message.session_id}:${message.type}:${message.ts}`;
  }
  if (asNonEmptyString(message.ts)) {
    return `${message.type}:${message.ts}`;
  }
  return `${fallbackPrefix ?? message.type}:unknown`;
}
function mapRole(value, fallback) {
  switch (value) {
    case "user":
    case "assistant":
    case "system":
    case "operator":
    case "escalation":
    case "error":
      return value;
    default:
      return fallback;
  }
}
function cloneMessage(message) {
  return {
    ...message,
    meta: message.meta ? { ...message.meta } : void 0
  };
}
function cloneEscalation(state) {
  if (!state) {
    return null;
  }
  return {
    ...state,
    allowedActions: [...state.allowedActions]
  };
}
function toEscalationActions(value) {
  return asStringArray(value).filter((action) => action === "continue" || action === "operator_input" || action === "reply_user");
}

// ../cortex-sdk-ui/dist/src/normalize.js
function buildAttachmentMeta(payload) {
  return Array.isArray(payload["attachments"]) ? { attachments: payload["attachments"] } : {};
}
function normalizeCortexMessage(message) {
  const payload = asPayload(message);
  const payloadMeta = isRecord(payload["meta"]) ? payload["meta"] : void 0;
  const mergedMeta = {
    ...isRecord(message.meta) ? message.meta : {},
    ...payloadMeta ?? {}
  };
  switch (message.type) {
    case "chat::message":
      return {
        id: buildMessageId(message),
        seq: message.seq ?? null,
        type: message.type,
        role: mapRole(payload["role"], "user"),
        content: payload["content"],
        status: "final",
        ts: message.ts ?? null,
        meta: {
          ...mergedMeta,
          ...buildAttachmentMeta(payload)
        }
      };
    case "chat::partial":
      return {
        id: buildMessageId(message, "partial"),
        seq: message.seq ?? null,
        type: message.type,
        role: mapRole(payload["role"], "assistant"),
        content: payload["content"],
        status: "streaming",
        ts: message.ts ?? null,
        meta: {
          ...mergedMeta,
          ...buildAttachmentMeta(payload),
          ...asNonEmptyString(payload["turn_id"]) ? { turnId: asNonEmptyString(payload["turn_id"]) } : {}
        }
      };
    case "chat::answer":
      return {
        id: buildMessageId(message, "answer"),
        seq: message.seq ?? null,
        type: message.type,
        role: mapRole(payload["role"], "assistant"),
        content: payload["content"],
        status: "final",
        ts: message.ts ?? null,
        meta: {
          ...mergedMeta,
          ...buildAttachmentMeta(payload),
          ...asNonEmptyString(payload["turn_id"]) ? { turnId: asNonEmptyString(payload["turn_id"]) } : {},
          ...asNonEmptyString(payload["answer_kind"]) ? { answerKind: asNonEmptyString(payload["answer_kind"]) } : {}
        }
      };
    case "escalation::request":
      return {
        id: buildMessageId(message, "escalation"),
        seq: message.seq ?? null,
        type: message.type,
        role: "escalation",
        content: payload["content"] ?? payload["message"] ?? payload["reason"] ?? payload,
        status: "final",
        ts: message.ts ?? null,
        meta: {
          ...mergedMeta,
          escalationId: asNonEmptyString(payload["escalation_id"]),
          reason: asNonEmptyString(payload["reason"]) ?? void 0,
          message: asNonEmptyString(payload["message"]) ?? void 0,
          waitToken: asNonEmptyString(payload["wait_token"]) ?? void 0,
          allowedActions: toEscalationActions(payload["allowed_actions"])
        }
      };
    case "escalation::reply":
      return {
        id: buildMessageId(message, "escalation-reply"),
        seq: message.seq ?? null,
        type: message.type,
        role: "operator",
        content: payload["content"] ?? payload,
        status: "final",
        ts: message.ts ?? null,
        meta: {
          ...mergedMeta,
          escalationId: asNonEmptyString(payload["escalation_id"]),
          action: asNonEmptyString(payload["action"]) ?? void 0,
          waitToken: asNonEmptyString(payload["wait_token"]) ?? void 0
        }
      };
    case "system::error":
      return {
        id: buildMessageId(message, "system-error"),
        seq: message.seq ?? null,
        type: message.type,
        role: "error",
        content: payload["message"] ?? payload,
        status: "error",
        ts: message.ts ?? null,
        meta: {
          ...mergedMeta,
          code: asNonEmptyString(payload["code"]) ?? void 0
        }
      };
    case "chat::question":
      return {
        id: buildMessageId(message, "question"),
        seq: message.seq ?? null,
        type: message.type,
        role: mapRole(payload["role"], "assistant"),
        content: payload["content"],
        status: "final",
        ts: message.ts ?? null,
        meta: {
          ...mergedMeta,
          ...asNonEmptyString(payload["turn_id"]) ? { turnId: asNonEmptyString(payload["turn_id"]) } : {}
        }
      };
    case "sandbox::snapshot":
    case "sandbox::lifecycle":
      return {
        id: buildMessageId(message),
        seq: message.seq ?? null,
        type: message.type,
        role: "system",
        content: payload,
        status: "final",
        ts: message.ts ?? null,
        meta: mergedMeta
      };
    default:
      return {
        id: buildMessageId(message, "unknown"),
        seq: message.seq ?? null,
        type: message.type,
        role: "system",
        content: payload,
        status: "final",
        ts: message.ts ?? null,
        meta: {
          ...mergedMeta,
          rawType: message.type
        }
      };
  }
}
function normalizeEscalationState(message) {
  if (message.type !== "escalation::request") {
    return null;
  }
  const payload = asPayload(message);
  const escalationId = asNonEmptyString(payload["escalation_id"]);
  if (!escalationId) {
    return null;
  }
  return {
    escalationId,
    reason: asNonEmptyString(payload["reason"]) ?? void 0,
    message: asNonEmptyString(payload["message"]) ?? void 0,
    content: payload["content"],
    allowedActions: toEscalationActions(payload["allowed_actions"]),
    waitToken: asNonEmptyString(payload["wait_token"]) ?? void 0,
    status: "pending"
  };
}

// ../cortex-sdk-ui/dist/src/escalation-controller.js
function createEscalationController(options) {
  let state = cloneEscalation(options.initialState ?? null);
  function emit(event) {
    options.onEvent?.(event);
  }
  function emitError(error) {
    emit({ type: "error", error });
  }
  function requireEscalation() {
    if (!state) {
      throw createControllerError("escalation_missing", "No pending escalation is available.", "escalation");
    }
    return state;
  }
  function validateAction(current, action) {
    if (!current.allowedActions.includes(action)) {
      throw createControllerError("action_not_allowed", `Escalation action ${action} is not allowed.`, "escalation", {
        escalationId: current.escalationId,
        allowedActions: current.allowedActions
      });
    }
  }
  function buildReplyRequest(current, action, content) {
    if (options.replyRequestBuilder) {
      return options.replyRequestBuilder({ escalation: current, action, content });
    }
    if (!current.waitToken) {
      throw createControllerError("wait_token_missing", "Current escalation has no waitToken. Provide replyRequestBuilder for server-side wait-token handling.", "escalation", {
        escalationId: current.escalationId,
        action
      });
    }
    return {
      escalationId: current.escalationId,
      waitToken: current.waitToken,
      action,
      ...content !== void 0 ? { content } : {}
    };
  }
  async function reply(action, content) {
    try {
      const current = requireEscalation();
      validateAction(current, action);
      if (!options.client.replyEscalation) {
        throw createControllerError("reply_escalation_missing", "Client does not implement replyEscalation().", "escalation");
      }
      const request = buildReplyRequest(current, action, content);
      await options.client.replyEscalation(request);
      state = {
        ...current,
        status: "replied"
      };
      emit({ type: "escalation_replied", action });
    } catch (error) {
      const viewModel = errorFromUnknown(error, "escalation_reply_failed", "escalation");
      emitError(viewModel);
      throw error;
    }
  }
  return {
    getState() {
      return cloneEscalation(state);
    },
    setState(nextState) {
      state = cloneEscalation(nextState);
    },
    ingest(message) {
      if (message.type === "escalation::request") {
        state = normalizeEscalationState(message);
        return cloneEscalation(state);
      }
      if (message.type === "escalation::reply" && state) {
        const payload = asPayload(message);
        const escalationId = asNonEmptyString(payload["escalation_id"]);
        if (escalationId && escalationId === state.escalationId) {
          state = {
            ...state,
            status: "replied"
          };
        }
      }
      return cloneEscalation(state);
    },
    async replyToUser(content) {
      await reply("reply_user", content);
    },
    async returnToWorker(content) {
      await reply("operator_input", content);
    },
    async continueWorker(content) {
      await reply("continue", content);
    }
  };
}

// ../cortex-sdk-ui/dist/src/transcript-store.js
function createTranscriptStore(options = {}) {
  const transcript = (options.initialTranscript ?? []).map((message) => cloneMessage(message));
  const indexById = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  for (const [index, message] of transcript.entries()) {
    indexById.set(message.id, index);
  }
  function snapshot() {
    return transcript.map((message) => cloneMessage(message));
  }
  function notify() {
    const nextSnapshot = snapshot();
    for (const listener of Array.from(listeners)) {
      listener(nextSnapshot);
    }
  }
  function addMessage(message) {
    transcript.push(message);
    indexById.set(message.id, transcript.length - 1);
    notify();
    return {
      transcript: snapshot(),
      mutation: {
        type: "message_added",
        message: cloneMessage(message)
      }
    };
  }
  function updateMessage(index, message) {
    transcript[index] = message;
    indexById.set(message.id, index);
    notify();
    return {
      transcript: snapshot(),
      mutation: {
        type: "message_updated",
        message: cloneMessage(message)
      }
    };
  }
  function buildMalformedPartialMessage(message) {
    const error = createChatError("partial_missing_turn_id", "chat::partial is missing payload.turn_id", "chat::partial", { type: message.type });
    const fallbackMessage = {
      id: normalizeCortexMessage({
        ...message,
        type: "system::error",
        payload: {
          code: error.code,
          message: error.message
        }
      }).id,
      seq: message.seq ?? null,
      type: message.type,
      role: "error",
      content: error.message,
      status: "error",
      ts: message.ts ?? null,
      meta: {
        code: error.code,
        rawType: message.type
      }
    };
    const result = addMessage(fallbackMessage);
    return {
      ...result,
      error
    };
  }
  return {
    getSnapshot() {
      return snapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ingest(message) {
      const payload = asPayload(message);
      if (message.type === "chat::partial" && !asNonEmptyString(payload["turn_id"])) {
        return buildMalformedPartialMessage(message);
      }
      const normalized = normalizeCortexMessage(message);
      const existingIndex = indexById.get(normalized.id);
      if (message.type === "chat::partial" && existingIndex !== void 0) {
        const existing = transcript[existingIndex];
        const nextMessage = {
          ...existing,
          seq: normalized.seq,
          type: normalized.type,
          role: normalized.role,
          status: "streaming",
          ts: normalized.ts,
          content: typeof existing.content === "string" && typeof normalized.content === "string" ? `${existing.content}${normalized.content}` : normalized.content,
          meta: {
            ...existing.meta ?? {},
            ...normalized.meta ?? {}
          }
        };
        return updateMessage(existingIndex, nextMessage);
      }
      if (message.type === "chat::answer" && existingIndex !== void 0) {
        const existing = transcript[existingIndex];
        const nextMessage = {
          ...existing,
          seq: normalized.seq,
          type: normalized.type,
          role: normalized.role,
          content: normalized.content,
          status: "final",
          ts: normalized.ts,
          meta: {
            ...existing.meta ?? {},
            ...normalized.meta ?? {}
          }
        };
        return updateMessage(existingIndex, nextMessage);
      }
      if (existingIndex !== void 0) {
        return updateMessage(existingIndex, normalized);
      }
      return addMessage(normalized);
    },
    reset() {
      transcript.length = 0;
      indexById.clear();
      notify();
    },
    upsertLocalMessage(message) {
      const existingIndex = indexById.get(message.id);
      if (existingIndex !== void 0) {
        return updateMessage(existingIndex, message);
      }
      return addMessage(message);
    }
  };
}

// ../cortex-sdk-ui/dist/src/chat-controller.js
var MESSAGE_SEND_TIMEOUT_MS = 15e3;
async function withTimeout(promise, timeoutMs, msg) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(msg)), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== void 0)
      clearTimeout(timer);
  }
}
function generateClientMsgId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
function createChatController(options) {
  const listeners = /* @__PURE__ */ new Set();
  const transcriptStore = createTranscriptStore();
  let unsubscribeFromClient = null;
  let destroyed = false;
  let lastError = null;
  let activeQuestion = null;
  let workerState = { state: "idle" };
  let workerStateTtlTimer = null;
  const escalationController = createEscalationController({
    client: options.client,
    replyRequestBuilder: options.replyRequestBuilder,
    onEvent: (event) => {
      if (event.type === "error") {
        lastError = event.error;
      }
      emit(event);
      emitStateChanged();
    }
  });
  function getChannelState() {
    return options.client.channelState ?? "CLOSED";
  }
  function getSessionState() {
    return options.client.sessionState ?? "CREATED";
  }
  function defaultInputLockPolicy() {
    const sessionState = getSessionState();
    const escalation = escalationController.getState();
    if (TERMINAL_SESSION_STATES.has(sessionState)) {
      return {
        locked: true,
        reason: `session_${sessionState.toLowerCase()}`
      };
    }
    if (options.mode !== "operator" && escalation?.status === "pending") {
      return {
        locked: true,
        reason: "pending_escalation"
      };
    }
    return { locked: false };
  }
  function computeState() {
    const channelState = getChannelState();
    const sessionState = getSessionState();
    const escalation = escalationController.getState();
    const input = options.inputLockPolicy ? options.inputLockPolicy({
      mode: options.mode ?? "end_user",
      channelState,
      sessionState,
      escalation
    }) : defaultInputLockPolicy();
    return {
      connection: {
        channelState,
        sessionState,
        isConnected: channelState === "OPEN",
        isStale: channelState === "STALE" || channelState === "RECONNECTING"
      },
      transcript: transcriptStore.getSnapshot().map((message) => cloneMessage(message)),
      input,
      escalation: cloneEscalation(escalation),
      lastError,
      activeQuestion: activeQuestion ? { ...activeQuestion, options: [...activeQuestion.options] } : null,
      workerState: { ...workerState }
    };
  }
  function emit(event) {
    options.onEvent?.(event);
  }
  function emitStateChanged() {
    const state = computeState();
    for (const listener of Array.from(listeners)) {
      listener(state);
    }
    options.onStateChange?.(state);
    emit({ type: "state_changed", state });
  }
  function setError(error) {
    lastError = error;
    emit({ type: "error", error });
  }
  function clearWorkerStateTtl() {
    if (workerStateTtlTimer !== null) {
      clearTimeout(workerStateTtlTimer);
      workerStateTtlTimer = null;
    }
  }
  function applyWorkerState(next) {
    clearWorkerStateTtl();
    workerState = next;
    if (next.expiresAt !== void 0) {
      const remaining = next.expiresAt - Date.now();
      if (remaining <= 0) {
        workerState = { state: "idle" };
        return;
      }
      workerStateTtlTimer = setTimeout(() => {
        workerState = { state: "idle" };
        workerStateTtlTimer = null;
        emitStateChanged();
      }, remaining);
    }
  }
  function resetWorkerStateToIdle() {
    clearWorkerStateTtl();
    workerState = { state: "idle" };
  }
  function ensureClientSubscription() {
    if (destroyed || unsubscribeFromClient) {
      return;
    }
    unsubscribeFromClient = options.client.onMessage(handleMessage);
  }
  function teardownClientSubscription() {
    if (!unsubscribeFromClient) {
      return;
    }
    unsubscribeFromClient();
    unsubscribeFromClient = null;
  }
  function handleMessage(message) {
    if (message.type === "system::state") {
      const payload = asPayload(message);
      const meta = isRecord(payload["meta"]) ? payload["meta"] : null;
      const stateName = asNonEmptyString(meta?.["state"]) ?? "idle";
      const label = asNonEmptyString(meta?.["label"]) ?? void 0;
      const ttlMs = typeof meta?.["ttl_ms"] === "number" ? meta["ttl_ms"] : void 0;
      const correlationId = asNonEmptyString(meta?.["correlation_id"]) ?? void 0;
      const expiresAt = ttlMs !== void 0 ? Date.now() + ttlMs : void 0;
      applyWorkerState({ state: stateName, label, expiresAt, correlation_id: correlationId });
      emitStateChanged();
      return;
    }
    const result = transcriptStore.ingest(message);
    if (result.mutation) {
      emit({
        type: result.mutation.type,
        message: cloneMessage(result.mutation.message)
      });
    }
    if (result.error) {
      lastError = result.error;
      emit({ type: "error", error: result.error });
    }
    const escalation = escalationController.ingest(message);
    if (message.type === "escalation::request" && escalation) {
      emit({ type: "escalation_opened", escalation: cloneEscalation(escalation) });
    }
    if (message.type === "chat::question") {
      resetWorkerStateToIdle();
      const payload = asPayload(message);
      const meta = isRecord(payload["meta"]) ? payload["meta"] : null;
      const questionId = meta ? asNonEmptyString(meta["question_id"]) : null;
      if (questionId) {
        const rawOptions = Array.isArray(meta?.["options"]) ? meta["options"] : [];
        activeQuestion = {
          question_id: questionId,
          input_type: asNonEmptyString(meta?.["input_type"]) ?? "radio",
          allow_reply: meta?.["allow_reply"] === true,
          options: rawOptions.filter((o) => isRecord(o)).map((o) => ({ id: String(o["id"] ?? ""), label: String(o["label"] ?? "") })).filter((o) => o.id !== "" && o.label !== ""),
          turn_id: asNonEmptyString(payload["turn_id"]) ?? null
        };
      }
    }
    if (message.type === "chat::answer" || message.type === "system::error") {
      activeQuestion = null;
      resetWorkerStateToIdle();
    }
    if (message.type === "system::error") {
      const payload = asPayload(message);
      lastError = createChatError(typeof payload["code"] === "string" ? payload["code"] : "system_error", typeof payload["message"] === "string" ? payload["message"] : "Runtime error", "system::error");
    }
    emitStateChanged();
  }
  async function runAction(action) {
    try {
      await action();
    } catch (error) {
      if (!(error instanceof Error)) {
        setError(errorFromUnknown(error));
      }
      throw error;
    }
  }
  return {
    getState() {
      return computeState();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async connect() {
      ensureClientSubscription();
      await options.client.connect();
      emitStateChanged();
    },
    async disconnect() {
      if (options.client.disconnect) {
        await options.client.disconnect();
      }
      teardownClientSubscription();
      emitStateChanged();
    },
    async sendMessage(message) {
      ensureClientSubscription();
      const clientMsgId = generateClientMsgId();
      const id = `client:${clientMsgId}`;
      const sendPayload = {
        content: message.content,
        attachments: message.attachments,
        meta: {
          ...message.meta ?? {},
          client_msg_id: clientMsgId
        }
      };
      const optimistic = {
        id,
        type: "chat::message",
        role: "user",
        content: message.content,
        status: "final",
        deliveryStatus: "sending",
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        clientMsgId,
        retryable: false,
        meta: { attachments: message.attachments ?? [] },
        originalPayload: sendPayload
      };
      transcriptStore.upsertLocalMessage(optimistic);
      emitStateChanged();
      try {
        await withTimeout(options.client.sendMessage(sendPayload), MESSAGE_SEND_TIMEOUT_MS, "Message was not sent");
        transcriptStore.upsertLocalMessage({ ...optimistic, deliveryStatus: "sent", retryable: false });
      } catch (err) {
        const sendError = err instanceof Error ? err.message : "Message was not sent";
        transcriptStore.upsertLocalMessage({ ...optimistic, deliveryStatus: "failed", retryable: true, sendError });
      }
      emitStateChanged();
    },
    async retryMessage(messageId) {
      const snapshot = transcriptStore.getSnapshot();
      const msg = snapshot.find((m) => m.id === messageId && m.role === "user" && m.retryable === true && m.originalPayload !== void 0);
      if (!msg?.originalPayload)
        return;
      const updated = {
        ...msg,
        deliveryStatus: "sending",
        retryable: false,
        sendError: void 0
      };
      transcriptStore.upsertLocalMessage(updated);
      emitStateChanged();
      try {
        await withTimeout(options.client.sendMessage(msg.originalPayload), MESSAGE_SEND_TIMEOUT_MS, "Message was not sent");
        transcriptStore.upsertLocalMessage({ ...updated, deliveryStatus: "sent", retryable: false });
      } catch (err) {
        const sendError = err instanceof Error ? err.message : "Message was not sent";
        transcriptStore.upsertLocalMessage({ ...updated, deliveryStatus: "failed", retryable: true, sendError });
      }
      emitStateChanged();
    },
    async replyToUser(content) {
      ensureClientSubscription();
      await runAction(() => escalationController.replyToUser(content));
    },
    async returnToWorker(content) {
      ensureClientSubscription();
      await runAction(() => escalationController.returnToWorker(content));
    },
    async continueWorker(content) {
      ensureClientSubscription();
      await runAction(() => escalationController.continueWorker(content));
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      clearWorkerStateTtl();
      teardownClientSubscription();
      listeners.clear();
    }
  };
}

// src/message-flags.ts
var TYPING_TYPES = /* @__PURE__ */ new Set(["chat::typing", "typing::start", "typing::stop"]);
var TERMINAL_SESSION_STATES2 = /* @__PURE__ */ new Set([
  "COMPLETED",
  "FAILED",
  "STOPPED",
  "TIMEOUT",
  "CANCELLED"
]);
function payloadValue(message, key) {
  if (!message.payload || typeof message.payload !== "object") {
    return void 0;
  }
  return message.payload[key];
}
function getMessageFlags(message) {
  const type = message.type;
  const answerKind = payloadValue(message, "answer_kind");
  return {
    startTyping: type === "chat::typing" || type === "typing::start",
    stopTyping: type === "typing::stop",
    finalAnswer: type === "chat::answer" && answerKind === "final",
    isQuestion: type === "chat::question"
  };
}
function isTypingMessageType(type) {
  return TYPING_TYPES.has(type);
}
function shouldHideTranscriptMessage(message) {
  return isTypingMessageType(message.type);
}
function isTerminalSessionState(sessionState) {
  return TERMINAL_SESSION_STATES2.has(sessionState);
}
function formatContent(value) {
  if (typeof value === "string") {
    return { contentText: value, formattedContent: null };
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return { contentText: value.join("\n"), formattedContent: null };
  }
  if (value === null || value === void 0) {
    return { contentText: "", formattedContent: null };
  }
  try {
    return { contentText: null, formattedContent: JSON.stringify(value, null, 2) };
  } catch {
    return { contentText: null, formattedContent: String(value) };
  }
}
function buildStatusText(state, isAwaitingAnswer, isTyping) {
  if (state.lastError) {
    return state.lastError.message;
  }
  if (state.escalation?.status === "pending") {
    return "Waiting for human review";
  }
  if (isAwaitingAnswer) {
    return "Waiting for answer...";
  }
  if (isTyping) {
    return "Digital Worker is typing...";
  }
  if (state.connection.isStale) {
    return "Reconnecting...";
  }
  if (!state.connection.isConnected) {
    return state.connection.channelState === "CONNECTING" ? "Connecting..." : `Connection: ${state.connection.channelState.toLowerCase()}`;
  }
  if (isTerminalSessionState(state.connection.sessionState)) {
    return `Session ${state.connection.sessionState.toLowerCase()}`;
  }
  return "Connected";
}

// src/renderer.ts
function formatFileSize(size) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function toAttachmentViewModel(attachment) {
  if (typeof attachment === "string") {
    const label2 = attachment.trim();
    if (!label2) {
      return null;
    }
    return {
      id: label2,
      label: label2,
      url: null,
      fileName: null,
      contentType: null,
      size: null
    };
  }
  if (!isRecord2(attachment)) {
    return null;
  }
  const id = toNonEmptyString(attachment.file_id) ?? toNonEmptyString(attachment.attachment_id);
  const fileName = toNonEmptyString(attachment.filename) ?? toNonEmptyString(attachment.file_name) ?? toNonEmptyString(attachment.name);
  const url = toNonEmptyString(attachment.download_url) ?? toNonEmptyString(attachment.url) ?? toNonEmptyString(attachment.href);
  const contentType = toNonEmptyString(attachment.content_type) ?? toNonEmptyString(attachment.mime_type) ?? toNonEmptyString(attachment.type);
  const size = typeof attachment.size === "number" ? attachment.size : typeof attachment.size_bytes === "number" ? attachment.size_bytes : null;
  const label = fileName ?? id ?? url;
  if (!label) {
    return null;
  }
  return {
    id,
    label,
    url,
    fileName,
    contentType,
    size
  };
}
function getMessageAttachments(message) {
  const attachments = message.meta?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments.map((attachment) => toAttachmentViewModel(attachment)).filter((attachment) => attachment !== null);
}
function renderTranscript(transcriptEl, state) {
  transcriptEl.replaceChildren();
  const visibleMessages = state.chat.transcript.filter((message) => !shouldHideTranscriptMessage(message));
  if (visibleMessages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cortex-widget__empty";
    empty.textContent = "Start the conversation when you are ready.";
    transcriptEl.appendChild(empty);
    return;
  }
  for (const message of visibleMessages) {
    const content = formatContent(message.content);
    const attachments = getMessageAttachments(message);
    const hasTextContent = content.contentText !== null ? content.contentText.trim().length > 0 : (content.formattedContent ?? "").trim().length > 0;
    const hasQuestionOptions = message.type === "chat::question" && Array.isArray(message.meta?.["options"]) && message.meta["options"].length > 0;
    if (!hasTextContent && attachments.length === 0 && !hasQuestionOptions) {
      continue;
    }
    const wrapper = document.createElement("article");
    wrapper.className = "cortex-widget__message";
    wrapper.dataset.role = message.role;
    wrapper.dataset.type = message.type;
    wrapper.setAttribute("data-testid", "transcript-message");
    const actor = isRecord2(message.meta?.["actor"]) ? message.meta["actor"] : null;
    const hasActorHeader = actor !== null && message.role !== "user" && message.role !== "error";
    if (hasActorHeader) {
      const actorHeader = document.createElement("div");
      actorHeader.className = "cortex-widget__actor";
      actorHeader.setAttribute("data-testid", "actor-header");
      const avatarUrl = toNonEmptyString(actor["avatar_url"]);
      if (avatarUrl) {
        const img = document.createElement("img");
        img.className = "cortex-widget__actor-avatar";
        img.src = avatarUrl;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        img.setAttribute("data-testid", "actor-avatar");
        actorHeader.appendChild(img);
      }
      const actorInfo = document.createElement("div");
      actorInfo.className = "cortex-widget__actor-info";
      const nameEl = document.createElement("span");
      nameEl.className = "cortex-widget__actor-name";
      nameEl.textContent = toNonEmptyString(actor["name"]) ?? "Assistant";
      nameEl.setAttribute("data-testid", "actor-name");
      actorInfo.appendChild(nameEl);
      const actorTitle = toNonEmptyString(actor["title"]);
      if (actorTitle) {
        const titleEl = document.createElement("span");
        titleEl.className = "cortex-widget__actor-title";
        titleEl.textContent = actorTitle;
        actorInfo.appendChild(titleEl);
      }
      actorHeader.appendChild(actorInfo);
      wrapper.appendChild(actorHeader);
    }
    const bubble = document.createElement("div");
    bubble.className = "cortex-widget__bubble";
    bubble.setAttribute("data-testid", "message-bubble");
    if (message.status) {
      bubble.dataset.status = message.status;
    }
    if (content.contentText !== null) {
      const textContent = content.contentText.trim();
      if (textContent.length > 0) {
        const text = document.createElement("div");
        text.className = "cortex-widget__bubble-text";
        text.textContent = textContent;
        bubble.appendChild(text);
      } else if (attachments.length > 0) {
        const fallback = document.createElement("div");
        fallback.className = "cortex-widget__bubble-text";
        fallback.textContent = "Attachment sent";
        bubble.appendChild(fallback);
      }
    } else {
      const pre = document.createElement("pre");
      pre.className = "cortex-widget__formatted";
      pre.textContent = content.formattedContent ?? "";
      bubble.appendChild(pre);
    }
    if (attachments.length > 0) {
      const attachmentList = document.createElement("ul");
      attachmentList.className = "cortex-widget__message-attachments";
      attachmentList.setAttribute("data-testid", "message-attachments");
      for (const attachment of attachments) {
        const item = document.createElement("li");
        item.className = "cortex-widget__message-attachment";
        const hasDownloadLink = message.role === "assistant" && attachment.url;
        if (hasDownloadLink) {
          const link = document.createElement("a");
          link.className = "cortex-widget__message-attachment-link";
          link.href = attachment.url ?? "#";
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          if (attachment.fileName) {
            link.download = attachment.fileName;
          }
          link.setAttribute("data-testid", "message-attachment-link");
          const label = document.createElement("span");
          label.className = "cortex-widget__message-attachment-label";
          label.textContent = attachment.label;
          const detailsParts = [];
          if (attachment.contentType) {
            detailsParts.push(attachment.contentType);
          }
          if (attachment.size !== null) {
            detailsParts.push(formatFileSize(attachment.size));
          }
          link.appendChild(label);
          if (detailsParts.length > 0) {
            const details = document.createElement("span");
            details.className = "cortex-widget__message-attachment-details";
            details.textContent = detailsParts.join(" \xB7 ");
            link.appendChild(details);
          }
          item.appendChild(link);
        } else {
          item.textContent = attachment.label;
        }
        attachmentList.appendChild(item);
      }
      bubble.appendChild(attachmentList);
    }
    if (message.type === "chat::question" && Array.isArray(message.meta?.["options"])) {
      const questionId = toNonEmptyString(message.meta?.["question_id"]);
      const inputType = toNonEmptyString(message.meta?.["input_type"]) ?? "radio";
      if (inputType === "checkbox") {
        console.warn('[cortex-chat-widget] chat::question input_type="checkbox" is not supported');
      }
      if (questionId && inputType !== "checkbox") {
        const isActive = state.chat.activeQuestion?.question_id === questionId;
        const optionsDisabled = !isActive || state.isAwaitingAnswer;
        const optionsContainer = document.createElement("div");
        optionsContainer.className = "cortex-widget__question-options";
        optionsContainer.setAttribute("data-testid", "question-options");
        for (const option of message.meta["options"]) {
          const optionId = toNonEmptyString(option["id"]);
          const optionLabel = toNonEmptyString(option["label"]);
          if (!optionId || !optionLabel) continue;
          const btn = document.createElement("button");
          btn.className = "cortex-widget__question-option";
          btn.type = "button";
          btn.textContent = optionLabel;
          btn.dataset.questionId = questionId;
          btn.dataset.optionId = optionId;
          btn.disabled = optionsDisabled;
          btn.setAttribute("data-testid", "question-option");
          optionsContainer.appendChild(btn);
        }
        bubble.appendChild(optionsContainer);
      }
    }
    const meta = document.createElement("div");
    meta.className = "cortex-widget__meta";
    if (hasActorHeader) {
      meta.textContent = message.status === "streaming" ? "streaming" : "";
    } else {
      const displayName = message.role === "user" ? "You" : message.role === "assistant" ? "Assistant" : message.role;
      const metaParts = [displayName];
      if (message.status === "streaming") {
        metaParts.push("streaming");
      }
      meta.textContent = metaParts.join(" \xB7 ");
    }
    let statusEl = null;
    if (message.role === "user" && message.deliveryStatus !== void 0 && message.deliveryStatus !== "sent") {
      statusEl = document.createElement("div");
      statusEl.className = "cortex-widget__message-status";
      statusEl.dataset.status = message.deliveryStatus;
      statusEl.setAttribute("data-testid", "message-delivery-status");
      if (message.deliveryStatus === "sending") {
        statusEl.textContent = "Sending\u2026";
      } else if (message.deliveryStatus === "failed") {
        const text = document.createElement("span");
        text.className = "cortex-widget__message-status-text";
        text.textContent = "Not sent";
        statusEl.appendChild(text);
        if (message.retryable) {
          const retryBtn = document.createElement("button");
          retryBtn.className = "cortex-widget__message-retry";
          retryBtn.type = "button";
          retryBtn.setAttribute("aria-label", "Retry message");
          retryBtn.setAttribute("title", "Retry message");
          retryBtn.setAttribute("data-testid", "message-retry-button");
          retryBtn.dataset.retryMsgId = message.id;
          retryBtn.innerHTML = getIconSvg("arrow-clockwise");
          statusEl.appendChild(retryBtn);
        }
      }
    }
    if (statusEl) {
      wrapper.append(bubble, statusEl, meta);
    } else {
      wrapper.append(bubble, meta);
    }
    transcriptEl.appendChild(wrapper);
  }
  if (transcriptEl.childElementCount === 0) {
    const empty = document.createElement("div");
    empty.className = "cortex-widget__empty";
    empty.textContent = "Start the conversation when you are ready.";
    transcriptEl.appendChild(empty);
    return;
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}
function renderWidget(dom, state, options, attachmentsAvailable, isUploading) {
  dom.host.style.setProperty("--cortex-accent-color", options.theme?.accentColor ?? "#2563eb");
  dom.host.style.setProperty("--cortex-background-color", options.theme?.backgroundColor ?? "#ffffff");
  dom.host.style.setProperty("--cortex-text-color", options.theme?.textColor ?? "#172033");
  dom.host.style.setProperty("--cortex-border-radius", options.theme?.borderRadius ?? "18px");
  dom.title.textContent = options.title;
  dom.subtitle.textContent = options.subtitle;
  dom.status.textContent = buildStatusText(state.chat, state.isAwaitingAnswer, state.isTyping);
  const isPanelVisible = state.mode === "embedded" || state.isOpen;
  dom.panel.hidden = !isPanelVisible;
  dom.launcher.textContent = options.launcherLabel;
  dom.launcher.hidden = state.mode !== "floating";
  const visibleError = state.error?.message ?? state.chat.lastError?.message ?? "";
  dom.errorBanner.textContent = visibleError;
  dom.errorBanner.dataset.visible = visibleError ? "true" : "false";
  const workerState = state.chat.workerState;
  const workerStateVisible = workerState.state !== "idle" && (workerState.expiresAt === void 0 || workerState.expiresAt > Date.now());
  if (workerStateVisible) {
    const label = workerState.label ?? (workerState.state === "working" ? "Digital worker is working\u2026" : workerState.state === "waiting" ? "Still working\u2026" : workerState.state === "error" ? "Something went wrong" : "");
    dom.workerStatus.textContent = label;
    dom.workerStatus.dataset.visible = "true";
    dom.workerStatus.dataset.state = workerState.state;
  } else {
    dom.workerStatus.textContent = "";
    dom.workerStatus.dataset.visible = "false";
    dom.workerStatus.dataset.state = "idle";
  }
  dom.typing.textContent = "Digital Worker is typing...";
  dom.typing.dataset.visible = state.isTyping ? "true" : "false";
  if (state.chat.escalation?.status === "pending") {
    dom.escalation.dataset.visible = "true";
    dom.escalation.textContent = "The Digital Worker is waiting for human/operator action before continuing.";
  } else {
    dom.escalation.dataset.visible = "false";
    dom.escalation.textContent = "";
  }
  dom.textarea.value = state.isDestroyed ? "" : dom.textarea.value;
  const questionLocksInput = !!state.chat.activeQuestion && !state.chat.activeQuestion.allow_reply;
  dom.textarea.disabled = state.chat.input.locked || state.isAwaitingAnswer || isUploading || questionLocksInput;
  const canSend = !state.chat.input.locked && !state.isAwaitingAnswer && !isUploading && !questionLocksInput && (dom.textarea.value.trim().length > 0 || state.selectedFile !== null);
  dom.sendButton.disabled = !canSend;
  const isReplyMode = state.chat.activeQuestion !== null;
  dom.sendButton.innerHTML = getIconSvg(isReplyMode ? "reply-fill" : "send-fill");
  dom.sendButton.setAttribute("aria-label", isReplyMode ? "Reply" : "Send message");
  dom.sendButton.setAttribute("title", isReplyMode ? "Reply" : "Send message");
  dom.attachButton.disabled = !attachmentsAvailable || state.chat.input.locked || state.isAwaitingAnswer || isUploading;
  dom.fileInput.disabled = dom.attachButton.disabled;
  dom.fileHint.textContent = attachmentsAvailable ? "" : "Attachments unavailable";
  dom.fileHint.title = attachmentsAvailable ? "" : "Attachments unavailable";
  if (state.selectedFile) {
    dom.fileChip.dataset.visible = "true";
    dom.fileChipName.textContent = state.selectedFile.name;
    dom.fileChipMeta.textContent = `${formatFileSize(state.selectedFile.size)}${state.selectedFile.type ? ` \xB7 ${state.selectedFile.type}` : ""}`;
    dom.fileChipRemove.disabled = state.isAwaitingAnswer || isUploading;
  } else {
    dom.fileChip.dataset.visible = "false";
    dom.fileChipName.textContent = "";
    dom.fileChipMeta.textContent = "";
    dom.fileChipRemove.disabled = true;
  }
  renderTranscript(dom.transcript, state);
}

// src/widget.ts
function clonePublicState(options, internal, chatState) {
  return {
    mode: options.mode,
    isOpen: options.mode === "embedded" ? true : internal.isOpen,
    isReady: internal.isReady,
    isDestroyed: internal.isDestroyed,
    isAwaitingAnswer: internal.isAwaitingAnswer,
    isTyping: internal.isTyping,
    selectedFile: internal.selectedFile ? { ...internal.selectedFile } : null,
    chat: chatState,
    error: internal.error ? { ...internal.error } : null
  };
}
function resolveUploadError(error, options, internal) {
  internal.isAwaitingAnswer = false;
  internal.isUploading = false;
  internal.error = toWidgetError(error, "upload_failed", "Attachment upload failed");
  options.onError?.(error);
}
function resolveRuntimeError(error, options, internal) {
  internal.isAwaitingAnswer = false;
  internal.isTyping = false;
  internal.isUploading = false;
  internal.error = toWidgetError(error, "widget_runtime_error", "Widget runtime error");
  options.onError?.(error);
}
function createWidgetHandle(args) {
  const { options, client, dom, mountTarget } = args;
  const controller = createChatController({
    client,
    mode: "end_user"
  });
  let chatState = controller.getState();
  const internal = {
    isOpen: options.mode === "embedded" ? true : options.initialOpen,
    isReady: false,
    isDestroyed: false,
    isAwaitingAnswer: false,
    isTyping: false,
    isUploading: false,
    attachmentsAvailable: typeof client.uploadAttachment === "function" || typeof client.uploadFile === "function",
    selectedFile: null,
    selectedFileValue: null,
    cachedUploadedAttachmentId: null,
    cachedUploadedFile: null,
    draftText: "",
    error: null
  };
  const domCleanup = /* @__PURE__ */ new Set();
  let unsubscribeController = null;
  let unsubscribeRawMessages = null;
  function getPublicState() {
    return clonePublicState(options, internal, chatState);
  }
  function syncTextareaValue() {
    if (dom.textarea.value !== internal.draftText) {
      dom.textarea.value = internal.draftText;
    }
  }
  function notifyAndRender() {
    syncTextareaValue();
    const state = getPublicState();
    renderWidget(dom, state, options, internal.attachmentsAvailable, internal.isUploading);
    options.onStateChange?.(state);
  }
  function setSelectedFile(file) {
    internal.selectedFileValue = file;
    internal.selectedFile = file ? {
      name: file.name,
      size: file.size,
      type: file.type
    } : null;
    if (!file || internal.cachedUploadedFile !== file) {
      internal.cachedUploadedAttachmentId = null;
      internal.cachedUploadedFile = null;
    }
  }
  function clearSelectedFile() {
    setSelectedFile(null);
    dom.fileInput.value = "";
  }
  async function uploadSelectedFile() {
    const file = internal.selectedFileValue;
    if (!file) {
      return null;
    }
    if (internal.cachedUploadedAttachmentId && internal.cachedUploadedFile === file) {
      return internal.cachedUploadedAttachmentId;
    }
    internal.isUploading = true;
    internal.error = null;
    notifyAndRender();
    try {
      let uploadedId;
      if (typeof client.uploadAttachment === "function") {
        uploadedId = await client.uploadAttachment(file);
      } else if (typeof client.uploadFile === "function") {
        uploadedId = await client.uploadFile(file);
      } else {
        throw createWidgetError(
          "attachments_unavailable",
          "Attachments are unavailable for the current client."
        );
      }
      internal.cachedUploadedAttachmentId = uploadedId;
      internal.cachedUploadedFile = file;
      internal.isUploading = false;
      notifyAndRender();
      return uploadedId;
    } catch (error) {
      resolveUploadError(error, options, internal);
      notifyAndRender();
      return null;
    }
  }
  async function handleSend() {
    if (internal.isDestroyed) {
      return;
    }
    const content = internal.draftText.trim();
    const hasContent = content.length > 0;
    const hasFile = internal.selectedFileValue !== null;
    const inputLocked = chatState.input.locked;
    const activeQuestion = chatState.activeQuestion;
    if (activeQuestion && !activeQuestion.allow_reply) {
      return;
    }
    if (inputLocked || internal.isAwaitingAnswer || internal.isUploading || !hasContent && !hasFile) {
      return;
    }
    internal.error = null;
    let attachmentId = null;
    if (hasFile) {
      attachmentId = await uploadSelectedFile();
      if (internal.selectedFileValue && attachmentId === null) {
        return;
      }
    }
    const questionMeta = activeQuestion ? { question_id: activeQuestion.question_id, selected_option: "reply" } : void 0;
    try {
      await controller.sendMessage({
        content: [content],
        attachments: attachmentId ? [attachmentId] : void 0,
        meta: questionMeta
      });
      internal.draftText = "";
      clearSelectedFile();
      internal.cachedUploadedAttachmentId = null;
      internal.cachedUploadedFile = null;
      internal.error = null;
      internal.isAwaitingAnswer = true;
      notifyAndRender();
    } catch (error) {
      internal.isAwaitingAnswer = false;
      internal.isUploading = false;
      internal.error = toWidgetError(error, "send_failed", "Message send failed");
      options.onError?.(error);
      notifyAndRender();
    }
  }
  async function handleOptionSelect(questionId, optionId, optionLabel) {
    if (internal.isDestroyed || internal.isAwaitingAnswer) {
      return;
    }
    try {
      await controller.sendMessage({
        content: [optionLabel],
        meta: { question_id: questionId, selected_option: optionId }
      });
      internal.draftText = "";
      internal.error = null;
      internal.isAwaitingAnswer = true;
      notifyAndRender();
    } catch (error) {
      internal.isAwaitingAnswer = false;
      internal.error = toWidgetError(error, "send_failed", "Message send failed");
      options.onError?.(error);
      notifyAndRender();
    }
  }
  function setOpen(nextOpen) {
    if (options.mode === "embedded" || internal.isDestroyed) {
      return;
    }
    internal.isOpen = nextOpen;
    notifyAndRender();
  }
  function teardown() {
    if (unsubscribeController) {
      unsubscribeController();
      unsubscribeController = null;
    }
    if (unsubscribeRawMessages) {
      unsubscribeRawMessages();
      unsubscribeRawMessages = null;
    }
    for (const dispose of Array.from(domCleanup)) {
      dispose();
      domCleanup.delete(dispose);
    }
  }
  unsubscribeController = controller.subscribe((nextState) => {
    chatState = nextState;
    if (nextState.lastError) {
      internal.error = null;
      internal.isAwaitingAnswer = false;
      internal.isTyping = false;
      internal.isUploading = false;
    }
    if (isTerminalSessionState(nextState.connection.sessionState)) {
      internal.isAwaitingAnswer = false;
      internal.isTyping = false;
      internal.isUploading = false;
    }
    notifyAndRender();
  });
  unsubscribeRawMessages = client.onMessage((message) => {
    const flags = getMessageFlags(message);
    if (flags.startTyping) {
      internal.isTyping = true;
    }
    if (flags.stopTyping) {
      internal.isTyping = false;
    }
    if (flags.finalAnswer) {
      internal.isAwaitingAnswer = false;
      internal.isTyping = false;
      internal.isUploading = false;
      internal.error = null;
    }
    if (flags.isQuestion) {
      internal.isAwaitingAnswer = false;
      internal.isTyping = false;
    }
    notifyAndRender();
  });
  const onTextareaInput = () => {
    internal.draftText = dom.textarea.value;
    notifyAndRender();
  };
  const onTextareaKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };
  const onComposerSubmit = (event) => {
    event.preventDefault();
    void handleSend();
  };
  const onAttachClick = () => {
    if (!internal.attachmentsAvailable || internal.isUploading || internal.isAwaitingAnswer || chatState.input.locked) {
      return;
    }
    dom.fileInput.click();
  };
  const onFileChange = () => {
    const file = dom.fileInput.files?.[0] ?? null;
    if (!internal.attachmentsAvailable || !file) {
      dom.fileInput.value = "";
      return;
    }
    setSelectedFile(file);
    notifyAndRender();
  };
  const onRemoveFile = () => {
    clearSelectedFile();
    notifyAndRender();
  };
  const onLauncherClick = () => {
    if (options.mode !== "floating") {
      return;
    }
    internal.isOpen = !internal.isOpen;
    notifyAndRender();
  };
  const onTranscriptClick = (event) => {
    const retryBtn = event.target.closest("[data-retry-msg-id]");
    if (retryBtn) {
      const msgId = retryBtn.dataset.retryMsgId;
      if (msgId) void controller.retryMessage(msgId);
      return;
    }
    const btn = event.target.closest(".cortex-widget__question-option");
    if (!btn || btn.disabled) return;
    const { questionId, optionId } = btn.dataset;
    const optionLabel = btn.textContent ?? "";
    if (questionId && optionId) {
      void handleOptionSelect(questionId, optionId, optionLabel);
    }
  };
  dom.textarea.addEventListener("input", onTextareaInput);
  dom.textarea.addEventListener("keydown", onTextareaKeyDown);
  dom.composer.addEventListener("submit", onComposerSubmit);
  dom.attachButton.addEventListener("click", onAttachClick);
  dom.fileInput.addEventListener("change", onFileChange);
  dom.fileChipRemove.addEventListener("click", onRemoveFile);
  dom.launcher.addEventListener("click", onLauncherClick);
  dom.transcript.addEventListener("click", onTranscriptClick);
  domCleanup.add(() => dom.textarea.removeEventListener("input", onTextareaInput));
  domCleanup.add(() => dom.textarea.removeEventListener("keydown", onTextareaKeyDown));
  domCleanup.add(() => dom.composer.removeEventListener("submit", onComposerSubmit));
  domCleanup.add(() => dom.attachButton.removeEventListener("click", onAttachClick));
  domCleanup.add(() => dom.fileInput.removeEventListener("change", onFileChange));
  domCleanup.add(() => dom.fileChipRemove.removeEventListener("click", onRemoveFile));
  domCleanup.add(() => dom.launcher.removeEventListener("click", onLauncherClick));
  domCleanup.add(() => dom.transcript.removeEventListener("click", onTranscriptClick));
  mountTarget.appendChild(dom.host);
  internal.isReady = true;
  notifyAndRender();
  options.onReady?.();
  void controller.connect().catch((error) => {
    resolveRuntimeError(error, options, internal);
    notifyAndRender();
  });
  return {
    destroy() {
      if (internal.isDestroyed) {
        return;
      }
      internal.isDestroyed = true;
      internal.isAwaitingAnswer = false;
      internal.isTyping = false;
      internal.isUploading = false;
      teardown();
      dom.host.remove();
      void controller.disconnect().catch((error) => {
        resolveRuntimeError(error, options, internal);
      });
      controller.destroy();
    },
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    toggle() {
      if (options.mode === "embedded") {
        return;
      }
      setOpen(!internal.isOpen);
    },
    getState() {
      return getPublicState();
    }
  };
}

// src/mount.ts
function callOnError(options, error) {
  options.onError?.(error);
}
function isHTMLElement(value) {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}
function assertBrowserEnvironment(options) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    const error = createWidgetError("browser_unsupported", "Cortex Chat Widget requires a browser environment.");
    callOnError(options, error);
    throw error;
  }
  if (typeof HTMLElement === "undefined") {
    const error = createWidgetError("browser_unsupported", "HTMLElement is unavailable in the current environment.");
    callOnError(options, error);
    throw error;
  }
}
function resolveOptions(targetOrOptions, maybeOptions) {
  const baseOptions = typeof targetOrOptions === "string" || isHTMLElement(targetOrOptions) ? { ...maybeOptions, target: targetOrOptions } : { ...targetOrOptions ?? {} };
  if (!baseOptions.apiKey) {
    const error = createWidgetError("missing_api_key", "Cortex Chat Widget requires apiKey.");
    callOnError(baseOptions, error);
    throw error;
  }
  return {
    ...baseOptions,
    apiKey: baseOptions.apiKey,
    authUrl: baseOptions.authUrl,
    target: baseOptions.target,
    theme: baseOptions.theme,
    client: baseOptions.client,
    onReady: baseOptions.onReady,
    onStateChange: baseOptions.onStateChange,
    onError: baseOptions.onError,
    mode: baseOptions.mode ?? "floating",
    position: baseOptions.position ?? "bottom-right",
    title: baseOptions.title ?? "Ask Cortex",
    subtitle: baseOptions.subtitle ?? "Your Digital Worker is here to help.",
    placeholder: baseOptions.placeholder ?? "Write your message...",
    launcherLabel: baseOptions.launcherLabel ?? "Ask Cortex",
    initialOpen: baseOptions.initialOpen ?? false
  };
}
function resolveMountTarget(options) {
  if (options.mode === "embedded") {
    if (!options.target) {
      throw createWidgetError("missing_target", "Embedded mode requires a target element or selector.");
    }
  }
  if (typeof options.target === "string") {
    const targetElement = document.querySelector(options.target);
    if (!isHTMLElement(targetElement)) {
      throw createWidgetError("target_not_found", `Target selector not found: ${options.target}`);
    }
    return {
      mountTarget: targetElement,
      targetElement
    };
  }
  if (isHTMLElement(options.target)) {
    return {
      mountTarget: options.target,
      targetElement: options.target
    };
  }
  return {
    mountTarget: document.body
  };
}
function createClient(options) {
  if (options.client) {
    return options.client;
  }
  return new CortexBrowserClient({
    apiKey: options.apiKey,
    authUrl: options.authUrl,
    onMessage: () => {
    }
  });
}
function mountCortexChat(targetOrOptions, maybeOptions) {
  const partialOptions = typeof targetOrOptions === "object" && targetOrOptions !== null && !isHTMLElement(targetOrOptions) ? targetOrOptions : maybeOptions ?? {};
  assertBrowserEnvironment(partialOptions);
  const options = resolveOptions(targetOrOptions, maybeOptions);
  const { mountTarget } = resolveMountTarget(options);
  void mountTarget;
  if (typeof HTMLElement.prototype.attachShadow !== "function") {
    const error = createWidgetError("shadow_dom_unsupported", "Cortex Chat Widget requires Shadow DOM support.");
    callOnError(options, error);
    throw error;
  }
  const client = createClient(options);
  const dom = createWidgetDom(options);
  return createWidgetHandle({
    options,
    client,
    dom,
    mountTarget
  });
}
export {
  mountCortexChat
};
//# sourceMappingURL=index.js.map
