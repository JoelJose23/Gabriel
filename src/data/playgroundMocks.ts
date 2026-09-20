import type { SelectOption } from '../components/shared/Select';

/**
 * Playground mock data — realistic 8–10 item lists for every dropdown/select
 * in the app, used by the temporary _DropdownPlayground test-harness page.
 * Fixed-by-design small domains (AttachMenu's 3 actions, aspect ratios)
 * intentionally stay small; everything else gets full 8–10 item lists.
 */

export const playgroundLlmModels: SelectOption[] = [
  { value: 'llama-3.1-70b', label: 'Llama 3.1 70B Instruct' },
  { value: 'llama-3.1-8b', label: 'Llama 3.1 8B Instruct' },
  { value: 'mistral-7b', label: 'Mistral 7B Instruct v0.3' },
  { value: 'mixtral-8x7b', label: 'Mixtral 8x7B Instruct' },
  { value: 'phi-3-mini', label: 'Phi-3 Mini 4K Instruct' },
  { value: 'phi-3-medium', label: 'Phi-3 Medium 128K Instruct' },
  { value: 'gemma-2-9b', label: 'Gemma 2 9B IT' },
  { value: 'gemma-2-27b', label: 'Gemma 2 27B IT' },
  { value: 'qwen-2.5-14b', label: 'Qwen 2.5 14B Instruct' },
  { value: 'deepseek-r1-8b', label: 'DeepSeek R1 Distill 8B' },
];

export const playgroundImageModels: SelectOption[] = [
  { value: 'sdxl-lightning', label: 'SDXL Lightning' },
  { value: 'sdxl-base', label: 'SDXL Base 1.0' },
  { value: 'flux-schnell', label: 'FLUX.1 Schnell' },
  { value: 'flux-dev', label: 'FLUX.1 Dev' },
  { value: 'sd-1.5', label: 'Stable Diffusion 1.5' },
  { value: 'sdxl-turbo', label: 'SDXL Turbo' },
  { value: 'pixart-sigma', label: 'PixArt-Sigma XL' },
  { value: 'kandinsky-3', label: 'Kandinsky 3.0' },
];

export const playgroundVoiceModels: SelectOption[] = [
  { value: 'kokoro-tts', label: 'Kokoro TTS' },
  { value: 'xtts-v2', label: 'XTTS v2' },
  { value: 'bark', label: 'Bark' },
  { value: 'whisper-large-v3', label: 'Whisper Large v3' },
  { value: 'whisper-medium', label: 'Whisper Medium' },
  { value: 'piper-lessac', label: 'Piper Lessac' },
  { value: 'piper-ryan', label: 'Piper Ryan' },
  { value: 'parler-mini', label: 'Parler-TTS Mini' },
];

export const playgroundVoicePresets: SelectOption[] = [
  { value: 'af_sarah', label: 'Sarah (EN-US Female)' },
  { value: 'af_nicole', label: 'Nicole (EN-US Female)' },
  { value: 'am_adam', label: 'Adam (EN-US Male)' },
  { value: 'am_michael', label: 'Michael (EN-US Male)' },
  { value: 'bf_emma', label: 'Emma (EN-GB Female)' },
  { value: 'bf_george', label: 'George (EN-GB Male)' },
  { value: 'jf_alpha', label: 'Alpha (JA Female)' },
  { value: 'jf_gongitsune', label: 'Gongitsune (JA Male)' },
  { value: 'zf_xiaobei', label: 'Xiaobei (ZH Female)' },
  { value: 'ef_dora', label: 'Dora (ES Female)' },
];

export const playgroundEngineModes: SelectOption[] = [
  { value: 'eco', label: 'Mode: Eco' },
  { value: 'balanced', label: 'Mode: Balanced' },
  { value: 'performance', label: 'Mode: Performance' },
  { value: 'turbo', label: 'Mode: Turbo' },
  { value: 'battery', label: 'Mode: Battery Saver' },
  { value: 'silent', label: 'Mode: Silent' },
  { value: 'creator', label: 'Mode: Creator' },
  { value: 'gaming', label: 'Mode: Low Latency' },
];

export const playgroundSamplers: SelectOption[] = [
  { value: 'euler-a', label: 'Euler a' },
  { value: 'euler', label: 'Euler' },
  { value: 'dpmpp-2m', label: 'DPM++ 2M Karras' },
  { value: 'dpmpp-sde', label: 'DPM++ SDE Karras' },
  { value: 'dpmpp-3m', label: 'DPM++ 3M SDE' },
  { value: 'ddim', label: 'DDIM' },
  { value: 'lcm', label: 'LCM' },
  { value: 'uni-pc', label: 'UniPC' },
  { value: 'heun', label: 'Heun' },
  { value: 'dpm-fast', label: 'DPM Fast' },
];

export const playgroundSteps: SelectOption[] = [
  { value: '4', label: '4 steps (Draft)' },
  { value: '8', label: '8 steps (Fast)' },
  { value: '12', label: '12 steps' },
  { value: '16', label: '16 steps' },
  { value: '20', label: '20 steps' },
  { value: '25', label: '25 steps (Balanced)' },
  { value: '30', label: '30 steps' },
  { value: '40', label: '40 steps' },
  { value: '50', label: '50 steps (Quality)' },
  { value: '80', label: '80 steps (Max)' },
];

export const playgroundSpeeds: SelectOption[] = [
  { value: '0.25', label: '0.25x (Quarter)' },
  { value: '0.5', label: '0.5x (Slow)' },
  { value: '0.75', label: '0.75x' },
  { value: '1.0', label: '1.0x (Normal)' },
  { value: '1.25', label: '1.25x' },
  { value: '1.5', label: '1.5x (Fast)' },
  { value: '1.75', label: '1.75x' },
  { value: '2.0', label: '2.0x (Double)' },
];

export const playgroundPitches: SelectOption[] = [
  { value: '-12', label: '-12 (Very Low)' },
  { value: '-9', label: '-9' },
  { value: '-6', label: '-6 (Low)' },
  { value: '-3', label: '-3' },
  { value: '0', label: '0 (Normal)' },
  { value: '3', label: '+3' },
  { value: '6', label: '+6 (High)' },
  { value: '9', label: '+9' },
  { value: '12', label: '+12 (Very High)' },
];

export const playgroundStartupRoutes: SelectOption[] = [
  { value: '/', label: 'Home' },
  { value: '/chat', label: 'Chat' },
  { value: '/image', label: 'Image' },
  { value: '/voice', label: 'Voice' },
  { value: '/models', label: 'Models' },
  { value: '/workflows', label: 'Workflows' },
  { value: '/system', label: 'System' },
  { value: '/settings', label: 'Settings' },
];

export const playgroundModelFilters: SelectOption[] = [
  { value: 'all', label: 'Filter: All' },
  { value: 'loaded', label: 'Filter: Loaded' },
  { value: 'available', label: 'Filter: Available' },
  { value: 'llm', label: 'Filter: LLM' },
  { value: 'image', label: 'Filter: Image' },
  { value: 'voice', label: 'Filter: Voice' },
  { value: 'favorites', label: 'Filter: Favorites' },
  { value: 'recent', label: 'Filter: Recently Used' },
];

export interface PlaygroundNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'success' | 'warning' | 'info';
}

export const playgroundNotifications: PlaygroundNotification[] = [
  { id: '1', title: 'Model Loaded', message: 'Llama 3.1 70B Instruct ready', time: '2m ago', type: 'success' },
  { id: '2', title: 'VRAM Usage Alert', message: 'VRAM utilization at 82%', time: '15m ago', type: 'warning' },
  { id: '3', title: 'Update Available', message: 'ComfyUI Bridge v2.2.0 is ready to install', time: '1h ago', type: 'info' },
  { id: '4', title: 'Download Complete', message: 'FLUX.1 Schnell FP8 weights verified', time: '2h ago', type: 'success' },
  { id: '5', title: 'Engine Restarted', message: 'Inference engine restarted in Balanced mode', time: '3h ago', type: 'info' },
  { id: '6', title: 'High Temperature', message: 'GPU temperature reached 81C during render', time: '5h ago', type: 'warning' },
  { id: '7', title: 'Workflow Finished', message: 'Batch image workflow completed 24/24 jobs', time: 'Yesterday', type: 'success' },
  { id: '8', title: 'Storage Warning', message: 'Model cache is using 61.4 GB of 80 GB', time: 'Yesterday', type: 'warning' },
];
