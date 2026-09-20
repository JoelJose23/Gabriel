import type { FC } from 'react';
import { useState, useEffect } from 'react';
import { Activity, CheckCircle2 } from 'lucide-react';
import { gpu, ram, engineStatus } from '../../data/mockData';
import { RadialGraph } from '../shared';

const generateInitialArray = (baseVal: number, variance: number, length = 12) => {
  return Array.from({ length }).map((_, i) => {
    const randomOffset = Math.sin(i * 0.8) * variance + (Math.random() * 4 - 2);
    return Math.max(5, Math.min(98, Math.round((baseVal + randomOffset) * 10) / 10));
  });
};

export const SystemMonitor: FC = () => {
  const [cpuData, setCpuData] = useState(() => generateInitialArray(28, 12));
  const [gpuData, setGpuData] = useState(() => generateInitialArray(42, 15));

  useEffect(() => {
    const interval = setInterval(() => {
      setCpuData(prev => {
        const last = prev[prev.length - 1];
        const nextVal = Math.max(10, Math.min(95, Math.round((last + (Math.random() * 8 - 4)) * 10) / 10));
        return [...prev.slice(1), nextVal];
      });

      setGpuData(prev => {
        const last = prev[prev.length - 1];
        const nextVal = Math.max(15, Math.min(98, Math.round((last + (Math.random() * 10 - 5)) * 10) / 10));
        return [...prev.slice(1), nextVal];
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const latestCpu = cpuData[cpuData.length - 1] ?? 28;
  const latestGpu = gpuData[gpuData.length - 1] ?? 42;

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
          <span className="px-2 py-0.5 rounded-full bg-[var(--color-hover)] text-[10px] font-mono font-semibold text-text-secondary">
            RTX 4070 Ti
          </span>
        </div>

        {/* 2-Column Gauge Layout for CPU and GPU */}
        <div className="grid grid-cols-2 gap-3 py-1">
          <div className="flex flex-col items-center">
            <RadialGraph percent={latestCpu} preset="cpu" size={68} strokeWidth={6} />
            <span className="text-[11px] font-bold text-text-primary mt-1">CPU Load</span>
          </div>

          <div className="flex flex-col items-center">
            <RadialGraph percent={latestGpu} preset="gpu" size={68} strokeWidth={6} />
            <span className="text-[11px] font-bold text-text-primary mt-1">GPU Load</span>
          </div>
        </div>

        {/* Memory Bars: VRAM and RAM */}
        <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-text-secondary font-medium">VRAM Usage</span>
              <span className="font-mono text-text-primary font-bold">{gpu.vramUsed} / {gpu.vramTotal} GB</span>
            </div>
            <div className="w-full bg-[var(--color-hover)] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${(gpu.vramUsed / gpu.vramTotal) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-text-secondary font-medium">System RAM</span>
              <span className="font-mono text-text-primary font-bold">{ram.used} / {ram.total} GB</span>
            </div>
            <div className="w-full bg-[var(--color-hover)] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-secondary h-full rounded-full transition-all duration-300"
                style={{ width: `${(ram.used / ram.total) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Sensor Specs Row */}
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-[var(--color-border)] text-center">
          <div className="bg-[var(--color-hover)] p-1.5 rounded-xl flex flex-col items-center justify-center">
            <span className="font-bold text-xs text-text-primary font-mono">{gpu.temperature}°C</span>
            <span className="text-[9px] text-text-secondary uppercase mt-0.5 font-semibold">Temp</span>
          </div>
          <div className="bg-[var(--color-hover)] p-1.5 rounded-xl flex flex-col items-center justify-center">
            <span className="font-bold text-xs text-text-primary font-mono">{gpu.power}W</span>
            <span className="text-[9px] text-text-secondary uppercase mt-0.5 font-semibold">Power</span>
          </div>
          <div className="bg-[var(--color-hover)] p-1.5 rounded-xl flex flex-col items-center justify-center">
            <span className="font-bold text-xs text-text-primary font-mono">{gpu.fanRpm}</span>
            <span className="text-[9px] text-text-secondary uppercase mt-0.5 font-semibold">RPM</span>
          </div>
        </div>
      </div>

      {/* Engine Status Card */}
      <div className="glass-panel aurora-glass p-3 space-y-2">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5">
          <span className="font-bold text-xs">Engine Status</span>
          <div className="flex items-center gap-1 text-[10px] text-secondary font-bold px-2 py-0.5 rounded-full bg-[var(--color-hover)]">
            <CheckCircle2 size={12} />
            Operational
          </div>
        </div>
        <div className="space-y-1 text-[10px]">
          {engineStatus.map(item => (
            <div key={item.name} className="flex items-center justify-between">
              <span className="text-text-secondary font-medium">{item.name}</span>
              <span className="text-secondary font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};