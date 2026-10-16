// Typed wrappers around Gabriel's REST endpoints.

import { ApiError, API_BASE, apiGet, apiPost, apiPut, streamChat } from './client';
import type {
  ConfigUpdateResponse,
  EngineConfig,
  EventsResponse,
  HealthResponse,
  ImageGenerationResponse,
  ModelListResponse,
  ModelStatus,
  ProcessListResponse,
} from '../types/api';
import type { TelemetrySnapshot } from '../types/telemetry';

// --- telemetry -------------------------------------------------------------

export function getTelemetry(signal?: AbortSignal): Promise<TelemetrySnapshot> {
  return apiGet<TelemetrySnapshot>('/v1/telemetry', signal);
}

// --- models ----------------------------------------------------------------

export function listModels(signal?: AbortSignal): Promise<ModelListResponse> {
  return apiGet<ModelListResponse>('/v1/models', signal);
}

export function loadModel(modelId: string, modelType: string): Promise<ModelStatus> {
  return apiPost<ModelStatus>('/v1/models/load', { model_id: modelId, model_type: modelType });
}

export function offloadModel(modelId: string): Promise<ModelStatus> {
  return apiPost<ModelStatus>('/v1/models/offload', { model_id: modelId });
}

export function unloadModel(modelId: string): Promise<ModelStatus> {
  return apiPost<ModelStatus>('/v1/models/unload', { model_id: modelId });
}

// --- config ----------------------------------------------------------------

export function getConfig(signal?: AbortSignal): Promise<EngineConfig> {
  return apiGet<EngineConfig>('/v1/config', signal);
}

export function putConfig(config: EngineConfig): Promise<ConfigUpdateResponse> {
  return apiPut<ConfigUpdateResponse>('/v1/config', config);
}

// --- system ----------------------------------------------------------------

export function getProcesses(signal?: AbortSignal): Promise<ProcessListResponse> {
  return apiGet<ProcessListResponse>('/v1/system/processes', signal);
}

export function getEvents(after = 0, signal?: AbortSignal): Promise<EventsResponse> {
  return apiGet<EventsResponse>(`/v1/system/events?after=${after}`, signal);
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/health', signal);
}

// --- inference -------------------------------------------------------------

export interface GenerateImageParams {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
}

export function generateImage(params: GenerateImageParams): Promise<ImageGenerationResponse> {
  return apiPost<ImageGenerationResponse>('/v1/images/generations', params);
}

export interface SynthesizeSpeechParams {
  model: string;
  input: string;
  voice?: string;
  speed?: number;
}

/** POST /v1/audio/speech — resolves to a WAV audio blob. */
export async function synthesizeSpeech(params: SynthesizeSpeechParams): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/wav' },
      body: JSON.stringify(params),
    });
  } catch (err) {
    throw new ApiError(
      0,
      `Cannot reach Gabriel at ${API_BASE}. Is the engine running? (${String(err)})`,
      'connection_refused',
    );
  }
  if (!res.ok) {
    let message = `Speech synthesis failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, message, 'speech_error');
  }
  return res.blob();
}

export interface ChatStreamParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  signal?: AbortSignal;
  onChunk: Parameters<typeof streamChat>[1];
}

export function streamChatCompletion(params: ChatStreamParams): Promise<void> {
  return streamChat(
    {
      model: params.model,
      messages: params.messages,
      stream: true,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
    },
    params.onChunk,
    params.signal,
  );
}
