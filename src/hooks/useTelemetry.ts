// src/hooks/useTelemetry.ts
import { useState, useEffect } from 'react';
import { getTelemetry } from '../api';
import type { TelemetrySnapshot } from '../types/telemetry';

const HISTORY_LENGTH = 10;

export function useTelemetry(pollIntervalMs = 1500) {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [gpuHistory, setGpuHistory] = useState<number[]>(() => Array(HISTORY_LENGTH).fill(0));
  const [cpuHistory, setCpuHistory] = useState<number[]>(() => Array(HISTORY_LENGTH).fill(0));
  const [vramHistory, setVramHistory] = useState<number[]>(() => Array(HISTORY_LENGTH).fill(0));
  const [ramHistory, setRamHistory] = useState<number[]>(() => Array(HISTORY_LENGTH).fill(0));

  useEffect(() => {
    let mounted = true;

    const fetchSnapshot = async () => {
      try {
        const data = await getTelemetry();
        if (!mounted || !data) return;

        setSnapshot(data);

        setGpuHistory(prev => [...prev.slice(1), data.gpu_util_percent]);
        setCpuHistory(prev => [...prev.slice(1), data.cpu_usage_percent]);

        const vramPercent = data.vram_total_bytes > 0
          ? (data.vram_used_bytes / data.vram_total_bytes) * 100
          : 0;
        setVramHistory(prev => [...prev.slice(1), Math.round(vramPercent * 10) / 10]);

        const ramPercent = data.ram_total_bytes > 0
          ? (data.ram_used_bytes / data.ram_total_bytes) * 100
          : 0;
        setRamHistory(prev => [...prev.slice(1), Math.round(ramPercent * 10) / 10]);
      } catch (err) {
        if (mounted) {
          console.error('Failed to fetch telemetry from Gabriel API:', err);
        }
      }
    };

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, pollIntervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return { snapshot, gpuHistory, cpuHistory, vramHistory, ramHistory };
}
