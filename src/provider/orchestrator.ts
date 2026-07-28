const HOST = (): string => process.env.CURA_ORCHESTRATOR_HOST ?? "http://localhost:8092";

export interface ChatStreamRequest {
  sessionId: string;
  content: string;
  residentId?: string;
  model?: string;
  mode?: string;
  pageContext?: string;
  enrichedContext?: string;
}

export type ChatStreamEventType = "delta" | "done" | "error";
export type ChatStreamHandler = (type: ChatStreamEventType, data: unknown) => void;

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 2000, ...rest } = init;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function ping(): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(`${HOST()}/api/chat/stream`, {
      method: "OPTIONS",
      timeoutMs: 2000,
    });
    // The endpoint only accepts POST, but any response (even 4xx/405) means
    // the orchestrator process is up and routing requests.
    return r.status > 0;
  } catch {
    return false;
  }
}

/**
 * POSTs one chat turn to cura.orchestrator's SSE endpoint and dispatches
 * delta|done|error events as they arrive. Mirrors
 * frontend/cura-compose/src/runtime/chat.ts, which is the reference client.
 */
export async function streamChat(
  req: ChatStreamRequest,
  onEvent: ChatStreamHandler,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${HOST()}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if ((err as Error | null)?.name === "AbortError") return;
    onEvent("error", err);
    return;
  }
  if (!res.ok || !res.body) {
    onEvent("error", new Error(`chat stream HTTP ${res.status}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        emitFrame(buffer.slice(0, sep), onEvent);
        buffer = buffer.slice(sep + 2);
      }
    }
    if (buffer.trim()) emitFrame(buffer, onEvent);
  } catch (err) {
    if ((err as Error | null)?.name === "AbortError") return;
    onEvent("error", err);
  }
}

function emitFrame(frame: string, onEvent: ChatStreamHandler): void {
  let event = "delta";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (!dataLines.length) return;
  const raw = dataLines.join("\n");
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* leave as raw string */
  }
  const type: ChatStreamEventType = event === "done" || event === "error" ? event : "delta";
  onEvent(type, data);
}
