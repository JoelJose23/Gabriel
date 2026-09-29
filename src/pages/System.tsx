import type { FC } from 'react';
import { useState, useEffect } from 'react';
import {
  RotateCcw,
  Activity,
  HardDrive,
  MemoryStick,
  RotateCw,
  SquareStop,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Info,
  Cpu,
} from 'lucide-react';
import { StatusDot, ModelBadge, RadialGraph } from '../components/shared';
import { Select } from '../components/shared/Select';
import { DualGlowingChart } from '../components/shared/DualGlowingChart';
import {
  gpu,
  ram,
  processTableData,
  engineStatus,
  systemAlerts,
} from '../data/mockData';
import { useCardSpotlight } from '../hooks/useCardSpotlight';

const engineModes = ['Balanced', 'Performance', 'Efficiency'] as const;

const generateInitialArray = (base: number, variance: number, len = 9) =>
  Array.from({ length: len }, (_, i) => {
    const v = base + Math.sin(i * 0.9) * variance + (Math.random() * 6 - 3);
    return Math.max(5, Math.min(98, Math.round(v * 10) / 10));
  });

export const System: FC = () => {
  const [selectedEngineMode, setSelectedEngineMode] = useState('Balanced');

  // Live-updating dual-layer data
  const [gpuUtilData, setGpuUtilData] = useState(() => generateInitialArray(48, 14));
  const [vramData, setVramData] = useState(() => generateInitialArray(62, 8));
  const [ramData, setRamData] = useState(() => generateInitialArray(58, 6));

  useEffect(() => {
    const interval = setInterval(() => {
      setGpuUtilData(prev => {
        const last = prev[prev.length - 1];
        const next = Math.max(10, Math.min(95, Math.round((last + (Math.random() * 10 - 5)) * 10) / 10));
        return [...prev.slice(1), next];
      });
      setVramData(prev => {
        const last = prev[prev.length - 1];
        const next = Math.max(30, Math.min(95, Math.round((last + (Math.random() * 4 - 2)) * 10) / 10));
        return [...prev.slice(1), next];
      });
      setRamData(prev => {
        const last = prev[prev.length - 1];
        const next = Math.max(30, Math.min(90, Math.round((last + (Math.random() * 4 - 2)) * 10) / 10));
        return [...prev.slice(1), next];
      });
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const latestGpuUtil = gpuUtilData[gpuUtilData.length - 1] ?? gpu.utilization;

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary">
      {/* Top Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel aurora-glass p-3.5">
        <div className="flex items-center gap-3">
          <Sliders className="text-primary" size={20} />
          <h1 className="font-bold text-lg text-text-primary">Engine Architecture & Telemetry</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select
            options={engineModes.map(m => ({ value: m, label: `Mode: ${m}` }))}
            value={selectedEngineMode}
            onChange={setSelectedEngineMode}
            className="w-44"
          />
          <button className="btn-secondary min-w-[150px] py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
            <RotateCcw size={14} strokeWidth={2} />
            Restart Engine
          </button>
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
              primaryLabel="Utilization"
              secondaryLabel="Baseline"
              primaryValue={`${latestGpuUtil}%`}
              secondaryValue="38%"
              icon={Activity}
              iconColor="primary"
              primaryData={gpuUtilData}
              secondaryData={gpuUtilData.map(v => Math.max(5, v - 18))}
              primaryColor="#635BFF"
              secondaryColor="#10B981"
            />
            <TelemetryCard
              title="VRAM Usage"
              primaryLabel="Used"
              secondaryLabel="Free"
              primaryValue={`${gpu.vramUsed} / ${gpu.vramTotal} GB`}
              secondaryValue={`${(gpu.vramTotal - gpu.vramUsed).toFixed(1)} GB free`}
              icon={HardDrive}
              iconColor="primary"
              primaryData={vramData}
              secondaryData={vramData.map(v => 100 - v)}
              primaryColor="#635BFF"
              secondaryColor="#10B981"
            />
            <TelemetryCard
              title="RAM Usage"
              primaryLabel="Used"
              secondaryLabel="Free"
              primaryValue={`${ram.used} / ${ram.total} GB`}
              secondaryValue={`${(ram.total - ram.used).toFixed(0)} GB free`}
              icon={MemoryStick}
              iconColor="secondary"
              primaryData={ramData}
              secondaryData={ramData.map(v => 100 - v)}
              primaryColor="#10B981"
              secondaryColor="#635BFF"
            />
          </div>

          {/* Process Table */}
          <div className="glass-panel aurora-glass flex min-h-0 flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="font-bold text-sm text-text-primary">Process Table</h2>
              <span className="badge badge-gray font-mono">{processTableData.length} active processes</span>
            </div>

            <div className="min-h-0 max-h-[34vh] overflow-auto">
              <table className="text-xs w-full" style={{ minWidth: '780px' }}>
                <thead>
                  <tr className="text-left text-text-secondary border-b border-[var(--color-border)] bg-[var(--color-hover)]">
                    <th className="p-3 font-semibold">Name</th>
                    <th className="p-3 font-semibold">Type & Status</th>
                    <th className="p-3 font-semibold">VRAM</th>
                    <th className="p-3 font-semibold">RAM</th>
                    <th className="p-3 font-semibold">Uptime</th>
                    <th className="p-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {processTableData.map((process, i) => (
                    <tr
                      key={process.name}
                      className={`border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition-colors ${
                        i === processTableData.length - 1 ? 'border-0' : ''
                      }`}
                    >
                      <td className="p-3 font-bold text-text-primary truncate max-w-[200px]">
                        {process.name}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-nowrap">
                          <ModelBadge type={process.type} status={process.status} size="sm" />
                          <span
                            className="pill text-[11px] font-semibold"
                            style={{
                              backgroundColor: process.status === 'running' ? 'rgba(16,185,129,0.12)' : 'rgba(156,163,175,0.12)',
                              color: process.status === 'running' ? '#10B981' : '#9CA3AF',
                            }}
                          >
                            <StatusDot status={process.status} size={5} />
                            {process.status.charAt(0).toUpperCase() + process.status.slice(1)}
                          </span>
                        </div>
                      </td>

                      <td className="p-3 font-mono text-text-secondary font-semibold whitespace-nowrap">{process.vram}</td>
                      <td className="p-3 font-mono text-text-secondary font-semibold whitespace-nowrap">{process.ram}</td>
                      <td className="p-3 font-mono text-text-secondary font-semibold whitespace-nowrap">{process.uptime}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="p-1.5 rounded-lg text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-colors cursor-pointer"
                            aria-label="Restart"
                          >
                            <RotateCw size={13} />
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-colors cursor-pointer"
                            aria-label="Stop"
                          >
                            <SquareStop size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* GPU Details & Telemetry Gauges */}
          <div className="glass-panel aurora-glass flex min-h-0 flex-col p-4 space-y-4 overflow-hidden">
            <h2 className="font-bold text-sm text-text-primary">GPU Details & Thermal Telemetry</h2>
            <div className="min-h-0 max-h-[42vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-text-secondary">GPU Hardware</span>
                  <span className="font-bold text-text-primary">{gpu.model}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-text-secondary">Driver Version</span>
                  <span className="font-mono font-bold text-text-primary">{gpu.driverVersion}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-text-secondary">CUDA Compute</span>
                  <span className="font-mono font-bold text-text-primary">v{gpu.cudaVersion} (Cap {gpu.computeCapability})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total Memory</span>
                  <span className="font-mono font-bold text-text-primary">{gpu.vramTotal} GB GDDR6X</span>
                </div>
              </div>

              {/* Radial Gauges Stack */}
              <div className="flex flex-col gap-3">
                <div className="p-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-border)] flex items-center gap-4">
                  <RadialGraph
                    percent={Math.round((gpu.temperature / 100) * 100)}
                    preset="temp"
                    size={72}
                    showCenterText={true}
                  />
                  <div>
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">GPU Temperature</div>
                    <div className="font-mono font-bold text-base text-text-primary mt-0.5">{gpu.temperature}°C</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">Target Max: 85°C · Optimal</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-border)] flex items-center gap-4">
                  <RadialGraph
                    percent={Math.round((gpu.power / 450) * 100)}
                    preset="power"
                    size={72}
                    showCenterText={true}
                  />
                  <div>
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Power Draw</div>
                    <div className="font-mono font-bold text-base text-text-primary mt-0.5">{gpu.power}W</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">TDP Cap: 450W</div>
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
                { label: 'GPU', value: gpu.model },
                { label: 'VRAM', value: `${gpu.vramTotal} GB`, mono: true },
                { label: 'CPU', value: 'AMD Ryzen 9 7950X' },
                { label: 'System RAM', value: `${ram.total} GB DDR5`, mono: true },
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
              <span>Backend Engine Status</span>
              <CheckCircle2 size={14} className="text-secondary" />
            </div>
            <div className="space-y-1.5">
              {engineStatus.map(item => (
                <div key={item.name} className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-hover)]">
                  <span className="text-text-primary font-semibold text-[11px]">{item.name}</span>
                  <span className="text-secondary font-bold text-[10px] flex items-center gap-1">
                    <StatusDot status="running" size={5} />
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">System Logs & Events</div>
            <div className="space-y-2 max-h-[34vh] overflow-y-auto">
              {systemAlerts.map(alert => {
                const isSuccess = alert.type === 'success';
                const isWarning = alert.type === 'warning';
                return (
                  <div key={alert.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[var(--color-hover)]">
                    <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${isSuccess ? 'bg-[var(--color-hover)] text-secondary' : 'bg-[var(--color-hover)] text-text-secondary'}`}>
                      {isSuccess ? <CheckCircle2 size={13} /> : isWarning ? <AlertTriangle size={13} /> : <Info size={13} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[11px] text-text-primary leading-snug">{alert.message}</p>
                      <span className="text-[9px] text-text-secondary font-mono mt-0.5 block">{alert.timestamp}</span>
                    </div>
                  </div>
                );
              })}
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
  iconColor: 'primary' | 'secondary' | 'tertiary';
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