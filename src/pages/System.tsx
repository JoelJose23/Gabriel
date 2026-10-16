import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  HardDrive,
  MemoryStick,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Info,
  Cpu,
  Zap,
} from 'lucide-react';
import { StatusDot, RadialGraph } from '../components/shared';
import { DualGlowingChart } from '../components/shared/DualGlowingChart';
import { useCardSpotlight } from '../hooks/useCardSpotlight';
import { useTelemetry } from '../hooks/useTelemetry';
import { getEvents, getHealth, getProcesses } from '../api';
import type { EventEntry, HealthResponse, ProcessInfo } from '../types/api';

const formatUptime = (secs: number): string => {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const clock = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return d > 0 ? `${d}d ${clock}` : clock;
};

const formatRam = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};

const formatEventTime = (tsUnixMs: number): string =>
  new Date(tsUnixMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const processDotStatus = (status: string): 'running' | 'warning' | 'idle' => {
  const s = status.toLowerCase();
  if (s.includes('run')) return 'running';
  if (s.includes('stop') || s.includes('zombie') || s.includes('dead')) return 'warning';
  return 'idle';
};

export const System: FC = () => {
  // Real telemetry fetched from the Gabriel API
  const { snapshot, gpuHistory, cpuHistory, vramHistory, ramHistory } = useTelemetry(1500);

  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processError, setProcessError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const eventsCursor = useRef(0);

  // Process table poll (endpoint samples CPU with a short interval server-side)
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const res = await getProcesses();
        if (mounted) {
          setProcesses(res.processes);
          setProcessError(null);
        }
      } catch (err) {
        if (mounted) setProcessError(err instanceof Error ? err.message : String(err));
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Engine health poll
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const res = await getHealth();
        if (mounted) setHealth(res);
      } catch {
        if (mounted) setHealth(null);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Engine events (cursor polling; server returns ascending seq)
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const res = await getEvents(eventsCursor.current);
        if (!mounted || res.events.length === 0) return;
        eventsCursor.current = Math.max(
          eventsCursor.current,
          ...res.events.map(e => e.seq),
        );
        setEvents(prev => [...res.events.slice().reverse(), ...prev].slice(0, 100));
      } catch {
        // transient polling errors are ignored; next tick retries
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Fallbacks while initial payload loads
  const GB = 1024 ** 3;
  const gpuUtil = Math.round(snapshot?.gpu_util_percent ?? 0);
  const cpuUtil = Math.round(snapshot?.cpu_usage_percent ?? 0);
  const vramUsed = (snapshot?.vram_used_bytes ?? 0) / GB;
  const vramTotal = (snapshot?.vram_total_bytes ?? 0) / GB;
  const ramUsed = (snapshot?.ram_used_bytes ?? 0) / GB;
  const ramTotal = (snapshot?.ram_total_bytes ?? 0) / GB;
  const gpuTemp = snapshot?.gpu_temperature_c ?? 0;
  const gpuPower = snapshot?.gpu_power_w ?? 0;
  const vramPercent = vramTotal > 0 ? (vramUsed / vramTotal) * 100 : 0;

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary">
      {/* Top Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel aurora-glass p-3.5">
        <div className="flex items-center gap-3">
          <Sliders className="text-primary" size={20} />
          <h1 className="font-bold text-lg text-text-primary">Engine Architecture & Telemetry</h1>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span
            className={`flex items-center gap-1.5 font-bold ${
              health ? 'text-secondary' : 'text-danger'
            }`}
          >
            <StatusDot status={health ? 'running' : 'warning'} size={6} />
            {health ? `API ${health.status} · v${health.version}` : 'API unreachable'}
          </span>
          <span className="badge badge-gray font-mono">
            {health ? `up ${formatUptime(health.uptime_secs)}` : '—'}
          </span>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Column */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-0 pr-1">

          {/* Telemetry Cards: GPU Util, VRAM Usage, System RAM */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TelemetryCard
              title="GPU Utilization"
              primaryLabel="GPU Active"
              secondaryLabel="CPU Active"
              primaryValue={`${gpuUtil}%`}
              secondaryValue={`${cpuUtil}%`}
              icon={Activity}
              primaryData={gpuHistory}
              secondaryData={cpuHistory}
              primaryColor="#635BFF"
              secondaryColor="#10B981"
            />
            <TelemetryCard
              title="VRAM Usage"
              primaryLabel="Used"
              secondaryLabel="Free"
              primaryValue={`${vramUsed.toFixed(1)} / ${vramTotal.toFixed(1)} GB`}
              secondaryValue={`${Math.max(0, vramTotal - vramUsed).toFixed(1)} GB free`}
              icon={HardDrive}
              primaryData={vramHistory}
              secondaryData={vramHistory.map(v => Math.max(0, 100 - v))}
              primaryColor="#635BFF"
              secondaryColor="#10B981"
            />
            <TelemetryCard
              title="RAM Usage"
              primaryLabel="Used"
              secondaryLabel="Free"
              primaryValue={`${ramUsed.toFixed(1)} / ${ramTotal.toFixed(1)} GB`}
              secondaryValue={`${Math.max(0, ramTotal - ramUsed).toFixed(0)} GB free`}
              icon={MemoryStick}
              primaryData={ramHistory}
              secondaryData={ramHistory.map(v => Math.max(0, 100 - v))}
              primaryColor="#10B981"
              secondaryColor="#635BFF"
            />
          </div>

          {/* Process Table (GET /v1/system/processes) */}
          <div className="glass-panel aurora-glass flex min-h-0 flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="font-bold text-sm text-text-primary">Process Table</h2>
              <span className="badge badge-gray font-mono">
                {processError ? 'unavailable' : `${processes.length} processes (top by memory)`}
              </span>
            </div>

            <div className="min-h-0 max-h-[34vh] overflow-auto">
              {processError ? (
                <div className="p-4 text-xs text-danger font-semibold">{processError}</div>
              ) : (
                <table className="text-xs w-full" style={{ minWidth: '640px' }}>
                  <thead>
                    <tr className="text-left text-text-secondary border-b border-[var(--color-border)] bg-[var(--color-hover)]">
                      <th className="p-3 font-semibold">Name</th>
                      <th className="p-3 font-semibold">PID</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold text-right">CPU</th>
                      <th className="p-3 font-semibold text-right">Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((process, i) => {
                      const dot = processDotStatus(process.status);
                      return (
                        <tr
                          key={process.pid}
                          className={`border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition-colors ${
                            i === processes.length - 1 ? 'border-0' : ''
                          }`}
                        >
                          <td className="p-3 font-bold text-text-primary truncate max-w-[260px]">
                            {process.name}
                          </td>
                          <td className="p-3 font-mono text-text-secondary font-semibold">{process.pid}</td>
                          <td className="p-3">
                            <span
                              className="pill text-[11px] font-semibold inline-flex items-center gap-1.5"
                              style={{
                                backgroundColor:
                                  dot === 'running' ? 'rgba(16,185,129,0.12)' : dot === 'warning' ? 'rgba(239,68,68,0.12)' : 'rgba(156,163,175,0.12)',
                                color: dot === 'running' ? '#10B981' : dot === 'warning' ? '#EF4444' : '#9CA3AF',
                              }}
                            >
                              <StatusDot status={dot} size={5} />
                              {process.status}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-text-secondary font-semibold text-right whitespace-nowrap">
                            {process.cpu_percent.toFixed(1)}%
                          </td>
                          <td className="p-3 font-mono text-text-secondary font-semibold text-right whitespace-nowrap">
                            {formatRam(process.memory_bytes)}
                          </td>
                        </tr>
                      );
                    })}
                    {processes.length === 0 && !processError && (
                      <tr>
                        <td colSpan={5} className="p-4 text-text-secondary text-center">
                          Sampling processes…
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* GPU Details & Thermal Telemetry */}
          <div className="glass-panel aurora-glass flex min-h-0 flex-col p-4 space-y-4 overflow-hidden">
            <h2 className="font-bold text-sm text-text-primary">GPU Details & Thermal Telemetry</h2>
            <div className="min-h-0 max-h-[42vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-text-secondary">GPU Hardware</span>
                  <span className="font-bold text-text-primary">{snapshot?.gpu_name || 'Detecting...'}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-text-secondary">Driver Version</span>
                  <span className="font-mono font-bold text-text-primary">{snapshot?.gpu_driver_version || 'N/A'}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-text-secondary">Memory Bus</span>
                  <span className="font-mono font-bold text-text-primary">
                    {snapshot ? `${snapshot.memory_bus_percent.toFixed(0)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-text-secondary">Power Draw</span>
                  <span className="font-mono font-bold text-text-primary">{gpuPower.toFixed(0)} W</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total Memory</span>
                  <span className="font-mono font-bold text-text-primary">{vramTotal.toFixed(1)} GB</span>
                </div>
              </div>

              {/* Radial Gauges Stack */}
              <div className="flex flex-col gap-3">
                <div className="p-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-border)] flex items-center gap-4">
                  <RadialGraph
                    percent={Math.round(Math.min(100, Math.max(0, gpuTemp)))}
                    preset="temp"
                    size={72}
                    showCenterText={true}
                  />
                  <div>
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">GPU Temperature</div>
                    <div className="font-mono font-bold text-base text-text-primary mt-0.5">{gpuTemp}°C</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">Live reading from NVML</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-border)] flex items-center gap-4">
                  <RadialGraph
                    percent={Math.round(Math.min(100, Math.max(0, vramPercent)))}
                    preset="power"
                    size={72}
                    showCenterText={true}
                  />
                  <div>
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">VRAM Occupancy</div>
                    <div className="font-mono font-bold text-base text-text-primary mt-0.5">{vramPercent.toFixed(0)}%</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">
                      {vramUsed.toFixed(1)} GB of {vramTotal.toFixed(1)} GB
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Info Sidebar */}
        <div className="w-80 flex-shrink-0 glass-panel aurora-glass p-4 overflow-y-auto space-y-4 text-xs">
          <div className="space-y-2">
            <div className="font-bold text-text-primary border-b border-[var(--color-border)] pb-2 flex items-center gap-1.5">
              <Cpu size={14} className="text-primary" />
              Hardware Specifications
            </div>
            <div className="space-y-1.5 text-text-secondary">
              {[
                { label: 'GPU', value: snapshot?.gpu_name ?? 'Detecting...' },
                { label: 'VRAM', value: `${vramTotal.toFixed(1)} GB`, mono: true },
                { label: 'System RAM', value: `${ramTotal.toFixed(1)} GB`, mono: true },
              ].map(row => (
                <div key={row.label} className="flex justify-between py-1 border-b border-[var(--color-border)] last:border-0">
                  <span>{row.label}</span>
                  <span className={`font-bold text-text-primary ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary flex items-center justify-between">
              <span>Engine Status</span>
              {health ? <CheckCircle2 size={14} className="text-secondary" /> : <AlertTriangle size={14} className="text-danger" />}
            </div>
            <div className="space-y-1.5">
              {[
                { name: 'API', value: health ? `${health.status} (${health.api})` : 'unreachable' },
                { name: 'Version', value: health ? `v${health.version}` : '—' },
                { name: 'Uptime', value: health ? formatUptime(health.uptime_secs) : '—' },
                { name: 'Loaded models', value: health ? String(health.loaded_models) : '—' },
                { name: 'Active jobs', value: health ? String(health.active_jobs) : '—' },
              ].map(item => (
                <div key={item.name} className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-hover)]">
                  <span className="text-text-primary font-semibold text-[11px]">{item.name}</span>
                  <span className="font-mono font-bold text-[10px] text-text-secondary">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">System Logs & Events</div>
            <div className="space-y-2 max-h-[34vh] overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-[11px] text-text-secondary italic">No engine events yet this session.</p>
              ) : (
                events.map(event => {
                  const isError = event.level === 'error';
                  const isWarning = event.level === 'warn' || event.level === 'warning';
                  return (
                    <div key={event.seq} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[var(--color-hover)]">
                      <div
                        className={`p-1.5 rounded-lg shrink-0 mt-0.5 bg-[var(--color-hover)] ${
                          isError ? 'text-danger' : isWarning ? 'text-warning' : 'text-text-secondary'
                        }`}
                      >
                        {isError || isWarning ? (
                          <AlertTriangle size={13} />
                        ) : (
                          <Info size={13} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[11px] text-text-primary leading-snug break-words">
                          {event.message}
                        </p>
                        <span className="text-[9px] text-text-secondary font-mono mt-0.5 block">
                          {formatEventTime(event.ts_unix_ms)} · {event.source} · {event.level}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary flex items-center justify-between">
              <span>Engine Subsystems</span>
              <Zap size={14} className="text-primary" />
            </div>
            <div className="space-y-1.5">
              {[
                { name: 'Model Manager', running: health !== null },
                { name: 'Bandwidth Governor', running: health !== null },
                { name: 'Memory Manager', running: health !== null },
                { name: 'VRAM Pager', running: health !== null },
              ].map(item => (
                <div key={item.name} className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-hover)]">
                  <span className="text-text-primary font-semibold text-[11px]">{item.name}</span>
                  <span className="font-bold text-[10px] flex items-center gap-1 text-secondary">
                    <StatusDot status={item.running ? 'running' : 'idle'} size={5} />
                    {item.running ? 'Running' : 'Offline'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TelemetryCard: FC<{
  title: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryValue: string;
  secondaryValue: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  primaryData: number[];
  secondaryData: number[];
  primaryColor: string;
  secondaryColor: string;
}> = ({ title, primaryLabel, secondaryLabel, primaryValue, secondaryValue, icon: Icon, primaryData, secondaryData, primaryColor, secondaryColor }) => {
  const { ref, onPointerMove } = useCardSpotlight();

  return (
    <div ref={ref} onPointerMove={onPointerMove} className="glass-panel aurora-glass p-3.5 space-y-2 cursor-default">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-[var(--color-primary-bg)] text-primary">
          <Icon size={15} />
        </div>
        <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">{title}</div>
      </div>

      <div className="flex items-start gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2 h-2 rounded-full" style={{ background: primaryColor }} />
            <span className="font-mono font-bold text-sm text-text-primary">{primaryValue}</span>
          </div>
          <div className="text-[10px] text-text-secondary">{primaryLabel}</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2 h-2 rounded-full" style={{ background: secondaryColor }} />
            <span className="font-mono text-xs text-text-secondary">{secondaryValue}</span>
          </div>
          <div className="text-[10px] text-text-secondary">{secondaryLabel}</div>
        </div>
      </div>

      <div className="pt-1">
        <DualGlowingChart
          primaryData={primaryData}
          secondaryData={secondaryData}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          cardBg="transparent"
          height={90}
        />
      </div>
    </div>
  );
};
