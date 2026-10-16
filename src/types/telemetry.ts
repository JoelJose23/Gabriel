export interface LoadedModel {
  id: string;
  model_type: string;
  residency: string;
  vram_bytes: number;
  idle_secs: number;
  active_jobs: number;
  in_use: boolean;
}

export interface TelemetrySnapshot {
  gpu_name: string;
  gpu_util_percent: number;
  gpu_temperature_c: number;
  gpu_power_w: number;
  gpu_driver_version: string;
  vram_total_bytes: number;
  vram_used_bytes: number;
  vram_high_watermark: number;
  engine_resident_bytes: number;
  vram_untracked_bytes: number;
  vram_peak_untracked_bytes: number;
  memory_bus_percent: number;
  bandwidth_pressure: number;
  ram_total_bytes: number;
  ram_used_bytes: number;
  cpu_usage_percent: number;
  loaded_models: LoadedModel[];
}
