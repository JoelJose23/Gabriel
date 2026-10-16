import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTelemetry } from '../../hooks/useTelemetry';
import { RadialGraph } from '../shared';
import { getHealth } from '../../api';
import type { HealthResponse } from '../../types/api';

export const SystemMonitor: FC = () => {
  const { snapshot: telemetry } = useTelemetry(2000); // Poll live telemetry every 2s
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const h = await getHealth();
        if (mounted) setHealth(h);
      } catch {
        if (mounted) setHealth(null);
      }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Fallbacks if telemetry isn't loaded yet
  const cpuLoad = telemetry?.cpu_usage_percent ?? 0;
  const gpuLoad = telemetry?.gpu_util_percent ?? 0;
  const gpuName = telemetry?.gpu_name || "NVIDIA GPU";

  // Convert bytes to GB with 1 decimal place
  const vramUsedGB = telemetry ? (telemetry.vram_used_bytes / (1024 * 1024 * 1024)).toFixed(1) : "0.0";
  const vramTotalGB = telemetry ? (telemetry.vram_total_bytes / (1024 * 1024 * 1024)).toFixed(1) : "0.0";

  const ramUsedGB = telemetry ? (telemetry.ram_used_bytes / (1024 * 1024 * 1024)).toFixed(1) : "0.0";
  const ramTotalGB = telemetry ? (telemetry.ram_total_bytes / (1024 * 1024 * 1024)).toFixed(1) : "0.0";

  const vramPercent = telemetry && telemetry.vram_total_bytes > 0
    ? (telemetry.vram_used_bytes / telemetry.vram_total_bytes) * 100
    : 0;

  const ramPercent = telemetry && telemetry.ram_total_bytes > 0
    ? (telemetry.ram_used_bytes / telemetry.ram_total_bytes) * 100
    : 0;

  return (
    <div className="space-y-4 text-text-primary select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-primary" strokeWidth={2.2} />
          <h2 className="font-bold text-xs tracking-tight uppercase">System Monitor</h2>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--color-hover)] text-[10px] text-secondary font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
          Live
        </span>
      </div>

      {/* Hardware Load Card (CPU, GPU, VRAM, RAM) */}
      <div className="glass-panel aurora-glass p-3.5 space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
          <span className="font-bold text-xs uppercase tracking-tight">Telemetry Load</span>
          <span className="px-2 py-0.5 rounded-full bg-[var(--color-hover)] text-[10px] font-mono font-semibold text-text-secondary truncate max-w-[140px]" title={gpuName}>
            {gpuName.replace("NVIDIA GeForce ", "")}
          </span>
        </div>

        {/* 2-Column Gauge Layout for CPU and GPU */}
        <div className="grid grid-cols-2 gap-3 py-1">
          <div className="flex flex-col items-center">
            <RadialGraph percent={cpuLoad} preset="cpu" size={68} strokeWidth={6} />
            <span className="text-[11px] font-bold text-text-primary mt-1">CPU Load</span>
          </div>

          <div className="flex flex-col items-center">
            <RadialGraph percent={gpuLoad} preset="gpu" size={68} strokeWidth={6} />
            <span className="text-[11px] font-bold text-text-primary mt-1">GPU Load</span>
          </div>
        </div>

        {/* Memory Bars: VRAM and RAM */}
        <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-text-secondary font-medium">VRAM Usage</span>
              <span className="font-mono text-text-primary font-bold">{vramUsedGB} / {vramTotalGB} GB</span>
            </div>
            <div className="w-full bg-[var(--color-hover)] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${vramPercent}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-text-secondary font-medium">System RAM</span>
              <span className="font-mono text-text-primary font-bold">{ramUsedGB} / {ramTotalGB} GB</span>
            </div>
            <div className="w-full bg-[var(--color-hover)] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-secondary h-full rounded-full transition-all duration-300"
                style={{ width: `${ramPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bus Pressure & Status Row */}
        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[var(--color-border)] text-center">
          <div className="bg-[var(--color-hover)] p-1.5 rounded-xl flex flex-col items-center justify-center">
            <span className="font-bold text-xs text-text-primary font-mono">
              {telemetry ? `${(telemetry.bandwidth_pressure * 100).toFixed(0)}%` : '0%'}
            </span>
            <span className="text-[9px] text-text-secondary uppercase mt-0.5 font-semibold">Bus Pressure</span>
          </div>
          <div className="bg-[var(--color-hover)] p-1.5 rounded-xl flex flex-col items-center justify-center">
            <span className="font-bold text-xs text-emerald-400 font-mono">Active</span>
            <span className="text-[9px] text-text-secondary uppercase mt-0.5 font-semibold">Governor</span>
          </div>
        </div>
      </div>

      {/* Engine Status Card */}
      <div className="glass-panel aurora-glass p-3 space-y-2">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5">
          <span className="font-bold text-xs">Engine Status</span>
          <div
            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-hover)] ${
              health ? 'text-secondary' : 'text-danger'
            }`}
          >
            {health ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {health ? 'Operational' : 'Offline'}
          </div>
        </div>
        <div className="space-y-1 text-[10px]">
          {[
            { name: 'API', status: health ? health.api : 'unreachable' },
            { name: 'Version', status: health ? `v${health.version}` : '—' },
            { name: 'Loaded models', status: health ? String(health.loaded_models) : '—' },
            { name: 'Active jobs', status: health ? String(health.active_jobs) : '—' },
          ].map(item => (
            <div key={item.name} className="flex items-center justify-between">
              <span className="text-text-secondary font-medium">{item.name}</span>
              <span
                className={`font-semibold flex items-center gap-1 ${
                  health ? 'text-secondary' : 'text-text-secondary'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${health ? 'bg-secondary' : 'bg-[var(--color-text-secondary)]'}`}
                />
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
