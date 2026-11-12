/**
 * Hop3 — Stage 1 source connectors: minimal MCP "streamable HTTP" client.
 *
 * Server-side module (Node runtime, global fetch). No external dependencies,
 * no 'use client'. Used by the Fiverr connector today and by the Upwork
 * connector once an OAuth-capable local MCP client provides the session.
 *
 * Implements just enough of the Model Context Protocol streamable-HTTP
 * transport for the source layer:
 *   - createSession(): JSON-RPC "initialize" handshake, then the
 *     "notifications/initialized" notification.
 *   - listTools():     "tools/list" (with bounded cursor pagination).
 *   - callTool():      "tools/call" with tool name + arguments.
 *
 * Honesty rules (Stage 1 non-negotiables):
 *   - Responses may be plain application/json OR text/event-stream; both are
 *     parsed (SSE events are reconstructed from `data:` lines).
 *   - The Mcp-Session-Id response header is tracked and resent on subsequent
 *     calls. Stateless servers simply never return one and that is fine.
 *   - Errors are structured (McpClientError with a kind) and never swallowed:
 *     timeouts (default 20s), non-2xx HTTP, JSON-RPC error objects, tool-level
 *     error results and unparseable payloads all surface honest messages.
 *   - The client performs only initialize/tools/list/tools/call. It never
 *     calls write-side tools and never stores credentials.
 */

/** Client identity sent in the initialize handshake. */
export interface McpClientInfo {
  name: string;
  version: string;
}

export interface McpServerInfo {
  name?: string;
  version?: string;
}

/** A live MCP session against one endpoint. */
export interface McpSession {
  endpoint: string;
  /** Present only when the server returned an Mcp-Session-Id header. */
  sessionId?: string;
  /** Protocol version the server confirmed in initialize. */
  protocolVersion: string;
  serverInfo?: McpServerInfo;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface McpContentBlock {
  type?: string;
  text?: string;
}

export interface McpToolResult {
  content?: McpContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
}

export type McpErrorKind =
  | "timeout"
  | "network"
  | "http"
  | "jsonrpc"
  | "tool"
  | "parse"
  | "protocol";

/** Structured, honest error for every MCP transport failure mode. */
export class McpClientError extends Error {
  readonly kind: McpErrorKind;
  readonly status?: number;
  readonly jsonrpcCode?: number | string;
  readonly detail?: unknown;

  constructor(
    kind: McpErrorKind,
    message: string,
    options?: { status?: number; jsonrpcCode?: number | string; detail?: unknown },
  ) {
    super(message);
    this.name = "McpClientError";
    this.kind = kind;
    this.status = options?.status;
    this.jsonrpcCode = options?.jsonrpcCode;
    this.detail = options?.detail;
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_PROTOCOL_VERSION = "2025-03-26";
const MAX_TOOL_LIST_PAGES = 5;
const BODY_SNIPPET_LENGTH = 300;

let jsonRpcIdCounter = 0;

function nextId(): number {
  jsonRpcIdCounter += 1;
  return jsonRpcIdCounter;
}

function snippet(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > BODY_SNIPPET_LENGTH
    ? `${collapsed.slice(0, BODY_SNIPPET_LENGTH)}...`
    : collapsed;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number | string; message?: string; data?: unknown };
}

/** Parse an SSE payload into JSON-RPC messages (one JSON message per event). */
function parseSseMessages(text: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  let dataLines: string[] = [];

  const flush = (): void => {
    if (dataLines.length === 0) return;
    const raw = dataLines.join('\n');
    dataLines = [];
    try {
      const parsed = JSON.parse(raw) as JsonRpcMessage;
      messages.push(parsed);
    } catch {
      // A single malformed event is skipped; if nothing parses at all the
      // caller raises a parse error, so nothing is silently turned into data.
    }
  };

  for (const line of text.split(/\r?\n/)) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).replace(/^ /, ""));
    }
    // event:/id:/comment lines carry no JSON-RPC payload for us.
  }
  flush();
  return messages;
}

function parseBodyMessages(contentType: string, text: string): JsonRpcMessage[] {
  if (text.trim() === "") return [];
  if (contentType.includes("text/event-stream")) {
    const messages = parseSseMessages(text);
    if (messages.length === 0) {
      throw new McpClientError("parse", `SSE body contained no parsable JSON-RPC message: ${snippet(text)}`);
    }
    return messages;
  }
  try {
    return [JSON.parse(text) as JsonRpcMessage];
  } catch (err) {
    throw new McpClientError("parse", `Response body is not valid JSON (${err instanceof Error ? err.message : String(err)})`, {
      detail: snippet(text),
    });
  }
}

interface PostOptions {
  timeoutMs?: number;
}

/**
 * Core transport: POST one JSON-RPC payload, read one response (plain JSON or
 * SSE), and return the `result` of the message whose id matches (null for
 * notifications, which legitimately have no response message).
 */
async function rpc(
  session: McpSession,
  id: number | null,
  method: string,
  params: Record<string, unknown> | undefined,
  options?: PostOptions,
): Promise<unknown | null> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const payload: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (id !== null) payload.id = id;
  if (params !== undefined) payload.params = params;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (session.sessionId) headers["mcp-session-id"] = session.sessionId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let bodyText = "";
  try {
    response = await fetch(session.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    // Track (and later resend) the session header whenever the server sends one.
    const sessionHeader = response.headers.get("mcp-session-id");
    if (sessionHeader) session.sessionId = sessionHeader;

    if (response.status === 202) {
      // Accepted notification: no body is expected; read and discard.
      await response.text().catch(() => "");
      return null;
    }
    if (!response.ok) {
      bodyText = await response.text().catch(() => "");
      throw new McpClientError(
        "http",
        `MCP endpoint ${session.endpoint} returned HTTP ${response.status} ${response.statusText}` +
          (bodyText.trim() !== "" ? `: ${snippet(bodyText)}` : ""),
        { status: response.status, detail: bodyText },
      );
    }
    bodyText = await response.text();
  } catch (err) {
    if (err instanceof McpClientError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new McpClientError("timeout", `MCP request to ${session.endpoint} timed out after ${timeoutMs}ms (${method})`);
    }
    throw new McpClientError("network", `MCP request to ${session.endpoint} failed (${method}): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const messages = parseBodyMessages(contentType, bodyText);

  if (id === null) {
    // Notifications expect no response message; an unexpected one is ignored.
    return null;
  }

  const matching = messages.find((message) => message.id === id);
  if (!matching) {
    throw new McpClientError("protocol", `No JSON-RPC response with id ${id} for "${method}" (received ${messages.length} message(s))`);
  }
  if (matching.error) {
    throw new McpClientError("jsonrpc", `JSON-RPC error for "${method}": ${matching.error.message ?? 'no message'} (code ${matching.error.code ?? 'none'})`, {
      jsonrpcCode: matching.error.code,
      detail: matching.error.data,
    });
  }
  if (!("result" in matching)) {
    throw new McpClientError("protocol", `JSON-RPC response for "${method}" has neither result nor error`);
  }
  return matching.result;
}

export interface McpSessionOptions {
  timeoutMs?: number;
  protocolVersion?: string;
}

/**
 * Open a session: initialize handshake + initialized notification.
 * Throws McpClientError on timeout, non-2xx, JSON-RPC error or bad payload.
 */
export async function createSession(
  endpoint: string,
  clientInfo: McpClientInfo,
  options?: McpSessionOptions,
): Promise<McpSession> {
  const protocolVersion = options?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
  const session: McpSession = { endpoint, protocolVersion };

  const initResult = await rpc(
    session,
    nextId(),
    "initialize",
    { protocolVersion, capabilities: {}, clientInfo },
    { timeoutMs: options?.timeoutMs },
  );
  if (initResult === null || typeof initResult !== "object") {
    throw new McpClientError("protocol", `initialize on ${endpoint} returned no result object`);
  }
  const result = initResult as { protocolVersion?: unknown; serverInfo?: unknown };
  if (typeof result.protocolVersion === "string" && result.protocolVersion !== "") {
    session.protocolVersion = result.protocolVersion;
  }
  if (result.serverInfo && typeof result.serverInfo === "object") {
    const info = result.serverInfo as McpServerInfo;
    session.serverInfo = {
      name: typeof info.name === "string" ? info.name : undefined,
      version: typeof info.version === "string" ? info.version : undefined,
    };
  }

  // Complete the handshake; stateless servers answer 202 with no message.
  await rpc(session, null, "notifications/initialized", {}, { timeoutMs: options?.timeoutMs });
  return session;
}

export interface ToolCallOptions {
  timeoutMs?: number;
}

/** tools/list with bounded cursor pagination. */
export async function listTools(session: McpSession, options?: ToolCallOptions): Promise<McpTool[]> {
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const result = await rpc(session, nextId(), "tools/list", cursor !== undefined ? { cursor } : {}, options);
    if (result === null || typeof result !== "object") {
      throw new McpClientError("protocol", "tools/list returned no result object");
    }
    const list = result as { tools?: unknown; nextCursor?: unknown };
    if (!Array.isArray(list.tools)) {
      throw new McpClientError("protocol", "tools/list result did not contain a tools array");
    }
    for (const tool of list.tools) {
      if (tool && typeof tool === "object" && typeof (tool as McpTool).name === "string") {
        tools.push(tool as McpTool);
      }
    }
    cursor = typeof list.nextCursor === "string" ? list.nextCursor : undefined;
    pages += 1;
    if (cursor && pages >= MAX_TOOL_LIST_PAGES) {
      throw new McpClientError("protocol", `tools/list pagination exceeded ${MAX_TOOL_LIST_PAGES} pages; refusing to guess the remaining tools`);
    }
  } while (cursor !== undefined);

  return tools;
}

/**
 * tools/call. Tool-level error results (isError: true) are surfaced as
 * McpClientError kind 'tool' with the tool's own text — never swallowed.
 */
export async function callTool(
  session: McpSession,
  name: string,
  args: Record<string, unknown>,
  options?: ToolCallOptions,
): Promise<McpToolResult> {
  const result = await rpc(session, nextId(), "tools/call", { name, arguments: args }, options);
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new McpClientError("protocol", `tools/call for "${name}" returned no result object`);
  }
  const toolResult = result as McpToolResult;
  if (toolResult.isError === true) {
    const text = (toolResult.content ?? [])
      .map((block) => (typeof block.text === "string" ? block.text : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    throw new McpClientError("tool", `MCP tool "${name}" returned an error result${text !== '' ? `: ${snippet(text)}` : ' (no detail provided)'}`, {
      detail: toolResult,
    });
  }
  return toolResult;
}

/** Human-readable description of any thrown error (McpClientError or not). */
export function describeMcpError(err: unknown): string {
  if (err instanceof McpClientError) {
    const parts = [`kind=${err.kind}`];
    if (err.status !== undefined) parts.push(`http=${err.status}`);
    if (err.jsonrpcCode !== undefined) parts.push(`code=${err.jsonrpcCode}`);
    return `${err.message} [${parts.join(', ')}]`;
  }
  return err instanceof Error ? err.message : String(err);
}
