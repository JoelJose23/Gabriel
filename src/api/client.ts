// HTTP client for the Gabriel REST API (Axum server on 127.0.0.1:8080).

import type { ChatChunk } from '../types/api';

const configured = import.meta.env.VITE_GABRIEL_API as string | undefined;

/** Base URL of the Gabriel engine API. Override with VITE_GABRIEL_API. */
export const API_BASE = (configured ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly type: string;

  constructor(status: number, message: string, type = 'error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
  }
}

interface ErrorBody {
  error?: { message?: string; type?: string };
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Request failed with status ${res.status}`;
  let type = 'error';
  try {
    const body = (await res.json()) as ErrorBody;
    if (body.error?.message) message = body.error.message;
    if (body.error?.type) type = body.error.type;
  } catch {
    // non-JSON error body — keep the status-derived message
  }
  return new ApiError(res.status, message, type);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiError(
      0,
      `Cannot reach Gabriel at ${API_BASE}. Is the engine running? (${String(err)})`,
      'connection_refused',
    );
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'GET', signal });
}

export function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

export function apiPut<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    signal,
  });
}

export interface ChatStreamRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: true;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Stream a chat completion over SSE.
 *
 * Resolves when the backend emits `[DONE]`; rejects on transport failures,
 * HTTP errors, or an in-stream `event: error` frame.
 */
export async function streamChat(
  body: ChatStreamRequest,
  onChunk: (chunk: ChatChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    throw new ApiError(
      0,
      `Cannot reach Gabriel at ${API_BASE}. Is the engine running? (${String(err)})`,
      'connection_refused',
    );
  }

  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(res.status, 'Response has no body', 'empty_response');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const handleEvent = (block: string): 'done' | void => {
    let eventName = '';
    const dataLines: string[] = [];
    for (const rawLine of block.split(/\r?\n/)) {
      if (rawLine.startsWith(':')) continue; // keep-alive comment
      if (rawLine.startsWith('event:')) eventName = rawLine.slice(6).trim();
      else if (rawLine.startsWith('data:')) dataLines.push(rawLine.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    if (data === '[DONE]') return 'done';
    if (eventName === 'error') {
      let message = 'stream failed';
      try {
        const parsed = JSON.parse(data) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        message = data;
      }
      throw new ApiError(500, message, 'stream_error');
    }
    try {
      onChunk(JSON.parse(data) as ChatChunk);
    } catch {
      // ignore malformed frames rather than killing the stream
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const matchLen = buffer.slice(idx).match(/^\r?\n\r?\n/)![0].length;
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + matchLen);
        if (block.trim().length > 0 && handleEvent(block) === 'done') {
          return;
        }
      }
    }
    // Stream closed without [DONE] — treat as complete (client aborts land here too).
  } catch (err) {
    if (signal?.aborted) return;
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, `Stream aborted: ${String(err)}`, 'stream_aborted');
  }
}
