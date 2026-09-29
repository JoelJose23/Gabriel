import type { FC } from 'react';
import { useState } from 'react';
import {
  Search,
  Plus,
  ChevronRight,
  HardDrive,
  Globe,
  Upload,
  Box,
  Cpu,
  Zap,
} from 'lucide-react';
import {
  StatusDot,
  ProgressBar,
  Select,
  Pill,
} from '../components/shared';
import {
  allModels as initialModels,
  storageBreakdown,
  modelRegistryActions,
} from '../data/mockData';
import { useCardSpotlight } from '../hooks/useCardSpotlight';

type ModelStatus = 'running' | 'offloaded' | 'available';
interface ExtendedModel {
  id: string;
  name: string;
  type: 'LLM' | 'Image' | 'Voice';
  quantization?: string;
  sizeOnDisk: string;
  vramRequired: number;
  vramUsed: number;
  status: ModelStatus;
  uptime?: string;
  role: string;
  icon?: string;
  color?: string;
}

type ModelFilter = 'All' | 'LLM' | 'Image' | 'Voice' | 'Loaded' | 'Offloaded' | 'Available';
const filters: ModelFilter[] = ['All', 'LLM', 'Image', 'Voice', 'Loaded', 'Offloaded', 'Available'];

const typeDotColor: Record<string, string> = {
  LLM: '#1D9BF0',
  Image: '#10a37f',
  Voice: '#9CA3AF',
};

export const Models: FC = () => {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ModelFilter>('All');
  const [modelsList, setModelsList] = useState<ExtendedModel[]>(() =>
    initialModels.map(m => ({
      ...m,
      status: (m.status === 'idle' ? 'available' : m.status) as ModelStatus,
    }))
  );

  const handleLoadModel = (id: string) => {
    setModelsList(prev =>
      prev.map(model => {
        if (model.id === id) {
          return {
            ...model,
            status: 'running',
            vramUsed: model.vramRequired,
          };
        }
        return model;
      })
    );
  };

  const handleOffloadModel = (id: string) => {
    setModelsList(prev =>
      prev.map(model => {
        if (model.id === id) {
          return {
            ...model,
            status: 'offloaded',
            vramUsed: 0,
          };
        }
        return model;
      })
    );
  };

  const handleUnloadModel = (id: string) => {
    setModelsList(prev =>
      prev.map(model => {
        if (model.id === id) {
          return {
            ...model,
            status: 'available',
            vramUsed: 0,
          };
        }
        return model;
      })
    );
  };

  const filteredModels = modelsList.filter(model => {
    const matchesSearch = model.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      activeFilter === 'All' ||
      activeFilter === model.type ||
      (activeFilter === 'Loaded' && model.status === 'running') ||
      (activeFilter === 'Offloaded' && model.status === 'offloaded') ||
      (activeFilter === 'Available' && model.status === 'available');
    return matchesSearch && matchesFilter;
  });

  const activeVramLoaded = modelsList.filter(m => m.status === 'running');
  const offloadedRam = modelsList.filter(m => m.status === 'offloaded');

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary">
      {/* Top Controls Shelf */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel aurora-glass p-3.5">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" size={16} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search local models..."
            className="w-full glass-pill py-2 pl-9 pr-4 text-xs font-semibold text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden md:flex items-center gap-1.5 flex-wrap">
            {filters.map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  activeFilter === filter
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-[var(--color-hover)] text-text-secondary hover:text-text-primary'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <Select
            options={filters.map(f => ({ value: f, label: `Filter: ${f}` }))}
            value={activeFilter}
            onChange={(val) => setActiveFilter(val as ModelFilter)}
            className="w-36 md:hidden"
          />
        </div>

        <button className="btn-primary py-2 px-3.5 flex items-center gap-1.5 text-xs shrink-0 font-bold">
          <Plus size={15} strokeWidth={2.5} />
          Add Model
        </button>
      </div>

      {/* Main Grid + Memory Sidebar */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Column: Model Cards */}
        <div className="flex-1 overflow-y-auto min-w-0 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr">
            {filteredModels.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                onLoad={() => handleLoadModel(model.id)}
                onOffload={() => handleOffloadModel(model.id)}
                onUnload={() => handleUnloadModel(model.id)}
              />
            ))}
          </div>
        </div>

        {/* Right Info Panel */}
        <div className="w-80 flex-shrink-0 glass-panel aurora-glass p-4 overflow-y-auto space-y-4 text-xs">
          {/* Disk Storage */}
          <div className="space-y-3">
            <div className="font-bold text-text-primary flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
              <HardDrive size={14} className="text-primary" />
              Disk Storage Usage
            </div>
            <div>
              <div className="flex justify-between text-text-secondary mb-1 font-medium">
                <span>Total Used</span>
                <span className="font-mono font-bold text-text-primary">142 GB / 512 GB</span>
              </div>
              <ProgressBar value={142} max={512} color="primary" height={6} />
            </div>

            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              {storageBreakdown.map(item => (
                <div key={item.type} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        item.color === 'primary' ? '#1D9BF0' : item.color === 'secondary' ? '#10a37f' : '#9CA3AF',
                    }}
                  />
                  <span className="text-text-primary font-medium">{item.type}</span>
                  <span className="font-mono text-text-secondary ml-auto">{item.used} GB</span>
                </div>
              ))}
            </div>
          </div>

          {/* VRAM / RAM Resident Models */}
          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary flex items-center justify-between">
              <span>Active in VRAM ({activeVramLoaded.length})</span>
              <Zap size={14} className="text-primary" />
            </div>

            <div className="space-y-1.5">
              {activeVramLoaded.length === 0 ? (
                <p className="text-[11px] text-text-secondary italic">No models in VRAM</p>
              ) : (
                activeVramLoaded.map(model => (
                  <div key={model.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--color-hover)]">
                    <StatusDot status="running" size={6} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[11px] text-text-primary truncate">{model.name}</div>
                      <div className="text-[10px] text-text-secondary">{model.role}</div>
                    </div>
                    <span className="font-mono text-[11px] text-primary font-bold">{model.vramUsed} GB</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Offloaded in System RAM */}
          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary flex items-center justify-between">
              <span>Paged to RAM ({offloadedRam.length})</span>
              <Cpu size={14} className="text-secondary" />
            </div>

            <div className="space-y-1.5">
              {offloadedRam.length === 0 ? (
                <p className="text-[11px] text-text-secondary italic">No models paged to System RAM</p>
              ) : (
                offloadedRam.map(model => (
                  <div key={model.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--color-hover)]">
                    <span className="w-2 h-2 rounded-full bg-secondary" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[11px] text-text-primary truncate">{model.name}</div>
                      <div className="text-[10px] text-text-secondary">Paged to RAM</div>
                    </div>
                    <span className="font-mono text-[10px] text-text-secondary font-bold">RAM</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Model Registry Actions */}
          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">Model Registry</div>
            <div className="space-y-1.5">
              {modelRegistryActions.map(action => (
                <button
                  key={action.label}
                  className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-[var(--color-hover)] hover:bg-[var(--color-active)] transition-colors text-left group cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-[var(--color-card)] text-text-secondary group-hover:text-primary transition-colors">
                    {action.icon === 'Globe' ? <Globe size={14} /> : <Upload size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[11px] text-text-primary">{action.label}</div>
                    <div className="text-[9px] text-text-secondary truncate">{action.description}</div>
                  </div>
                  <ChevronRight size={14} className="text-text-secondary group-hover:text-text-primary shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModelCard: FC<{
  model: ExtendedModel;
  onLoad: () => void;
  onOffload: () => void;
  onUnload: () => void;
}> = ({ model, onLoad, onOffload, onUnload }) => {
  const isRunning = model.status === 'running';
  const isOffloaded = model.status === 'offloaded';
  const { ref, onPointerMove } = useCardSpotlight();

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className="glass-panel aurora-glass p-5 cursor-default hover:border-primary/40 transition-all flex flex-col gap-4 min-h-[220px] h-full overflow-hidden"
    >
      {/* Top Metadata Container (Flex with Wrapping) */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 w-full">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <Pill variant="glass" size="xs" className="font-bold shrink-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: typeDotColor[model.type] ?? '#9CA3AF' }}
            />
            {model.type}
          </Pill>

          {model.quantization ? (
            <Pill variant="glass" mono size="xs" className="shrink-0">
              {model.quantization}
            </Pill>
          ) : null}

          <Pill
            variant={isRunning ? 'secondary' : isOffloaded ? 'tertiary' : 'default'}
            size="xs"
            className="font-bold shrink-0"
          >
            <StatusDot status={isRunning ? 'running' : isOffloaded ? 'warning' : 'idle'} size={5} />
            {isRunning ? 'Running (VRAM)' : isOffloaded ? 'Offloaded (RAM)' : 'Available'}
          </Pill>
        </div>

        <Pill variant="glass" mono size="xs" className="font-semibold shrink-0 ml-auto">
          {model.sizeOnDisk}
        </Pill>
      </div>

      {/* Middle Content: Title & Description in Normal Document Flow */}
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-sm text-text-primary truncate">{model.name}</h4>
        <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">{model.role}</p>
      </div>

      {/* Bottom Action Area: mt-auto Ensures Pinned to Bottom */}
      <div className="mt-auto pt-3.5 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="text-xs flex items-center gap-1.5 shrink-0">
          <span className="text-text-secondary">Req VRAM:</span>
          <Pill variant="primary" mono size="xs" className="font-bold shrink-0">
            {model.vramRequired} GB
          </Pill>
        </div>

        {/* Action Button Stack (Load, Offload, Unload) */}
        <div className="flex items-center gap-1.5 flex-wrap ml-auto shrink-0">
          {isRunning && (
            <>
              <button
                onClick={onOffload}
                title="Page weights to system RAM"
                className="model-action-button btn-secondary transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 active:scale-95 shrink-0"
              >
                Offload
              </button>
              <button
                onClick={onUnload}
                className="model-action-button btn-secondary transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 active:scale-95 shrink-0"
              >
                Unload
              </button>
            </>
          )}

          {isOffloaded && (
            <>
              <button
                onClick={onLoad}
                className="model-action-button btn-primary shrink-0"
              >
                Load VRAM
              </button>
              <button
                onClick={onUnload}
                className="model-action-button btn-secondary transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 active:scale-95 shrink-0"
              >
                Unload
              </button>
            </>
          )}

          {model.status === 'available' && (
            <button
              onClick={onLoad}
              className="model-action-button btn-primary shrink-0"
            >
              Load Model
            </button>
          )}
        </div>
      </div>
    </div>
  );
};