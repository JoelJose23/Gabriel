import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Plus,
  HardDrive,
  Zap,
  Cpu,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  StatusDot,
  ProgressBar,
  Select,
  Pill,
} from '../components/shared';
import { listModels, loadModel, offloadModel, unloadModel } from '../api';
import type { ModelKind, ModelListEntry } from '../types/api';
import { useTelemetry } from '../hooks/useTelemetry';
import { useCardSpotlight } from '../hooks/useCardSpotlight';

type CardType = 'LLM' | 'Image' | 'Voice';
type CardStatus = 'running' | 'offloaded' | 'available';

interface Preset {
  id: string;
  name: string;
  type: CardType;
  kind: ModelKind;
  role: string;
  sizeLabel: string;
  estimateVramGb: number;
}

/** Engine-loadable model ids (the backend factory resolves these; first load
 * of a real-weight model downloads its weights from the Hugging Face hub). */
const presets: Preset[] = [
  {
    id: 'gabriel-mini',
    name: 'Gabriel Mini',
    type: 'LLM',
    kind: 'llm',
    role: 'Instant local demo model — deterministic, no download required.',
    sizeLabel: '0 GB',
    estimateVramGb: 0.2,
  },
  {
    id: 'qwen2.5-3b-instruct',
    name: 'Qwen2.5 3B Instruct',
    type: 'LLM',
    kind: 'llm',
    role: 'Q4_K_M GGUF chat model. Weights (~2 GB) download on first load.',
    sizeLabel: '~2.0 GB',
    estimateVramGb: 2.2,
  },
  {
    id: 'dreamshaper-8-lcm',
    name: 'DreamShaper 8 LCM',
    type: 'Image',
    kind: 'image',
    role: 'Fast SD1.5 image generation in 4–8 steps. Weights (~2 GB) download on first load.',
    sizeLabel: '~2.0 GB',
    estimateVramGb: 2.4,
  },
  {
    id: 'kokoro-82m',
    name: 'Kokoro 82M TTS',
    type: 'Voice',
    kind: 'tts',
    role: 'Local text-to-speech (~1 GB). Demo voice when built without the tts-kokoro feature.',
    sizeLabel: '~1.0 GB',
    estimateVramGb: 1.0,
  },
];

interface CardModel {
  id: string;
  name: string;
  type: CardType;
  role: string;
  status: CardStatus;
  vramBytes: number;
  sizeLabel: string;
  kind: ModelKind;
  estimateVramGb: number;
}

type ModelFilter = 'All' | 'LLM' | 'Image' | 'Voice' | 'Loaded' | 'Offloaded' | 'Available';
const filters: ModelFilter[] = ['All', 'LLM', 'Image', 'Voice', 'Loaded', 'Offloaded', 'Available'];

const typeDotColor: Record<string, string> = {
  LLM: '#1D9BF0',
  Image: '#10a37f',
  Voice: '#9CA3AF',
};

const kindToCardType: Record<ModelKind, CardType> = {
  llm: 'LLM',
  embedding: 'LLM',
  image: 'Image',
  tts: 'Voice',
  asr: 'Voice',
};

function toCards(entries: ModelListEntry[]): CardModel[] {
  const registryIds = new Set(entries.map(e => e.id));
  const fromRegistry: CardModel[] = entries.map(entry => {
    const preset = presets.find(p => p.id === entry.id);
    const running = entry.gabriel.residency === 'vram';
    return {
      id: entry.id,
      name: preset?.name ?? entry.id,
      type: preset?.type ?? kindToCardType[entry.gabriel.model_type],
      role: preset?.role ?? `Registered ${entry.gabriel.model_type} model`,
      status: running ? 'running' : 'offloaded',
      vramBytes: entry.gabriel.vram_bytes,
      sizeLabel: preset?.sizeLabel ?? `${(entry.gabriel.vram_bytes / 1e9).toFixed(1)} GB`,
      kind: preset?.kind ?? entry.gabriel.model_type,
      estimateVramGb: preset?.estimateVramGb ?? entry.gabriel.vram_bytes / 1e9,
    };
  });
  const available: CardModel[] = presets
    .filter(p => !registryIds.has(p.id))
    .map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      role: p.role,
      status: 'available',
      vramBytes: 0,
      sizeLabel: p.sizeLabel,
      kind: p.kind,
      estimateVramGb: p.estimateVramGb,
    }));
  return [...fromRegistry, ...available];
}

export const Models: FC = () => {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ModelFilter>('All');
  const [modelsList, setModelsList] = useState<CardModel[]>(() => toCards([]));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLoadById, setShowLoadById] = useState(false);
  const [customId, setCustomId] = useState('');
  const [customType, setCustomType] = useState<ModelKind>('llm');
  const { snapshot: telemetry } = useTelemetry();

  const refresh = useCallback(async () => {
    try {
      const res = await listModels();
      setModelsList(toCards(res.data));
      setFetchError(null);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : 'Cannot reach the Gabriel API at http://127.0.0.1:8080',
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleLoadModel = (model: CardModel) =>
    runAction(model.id, () => loadModel(model.id, model.kind));
  const handleOffloadModel = (id: string) => runAction(id, () => offloadModel(id));
  const handleUnloadModel = (id: string) => runAction(id, () => unloadModel(id));

  const handleLoadById = async () => {
    const id = customId.trim();
    if (!id) return;
    setBusyId(id);
    setActionError(null);
    try {
      await loadModel(id, customType);
      setCustomId('');
      setShowLoadById(false);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const filteredModels = modelsList.filter(model => {
    const matchesSearch =
      model.name.toLowerCase().includes(search.toLowerCase()) ||
      model.id.toLowerCase().includes(search.toLowerCase());
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

  const vramTotal = telemetry?.vram_total_bytes ?? 0;
  const vramUsed = telemetry?.vram_used_bytes ?? 0;
  const vramUsedGb = (vramUsed / 1e9).toFixed(1);
  const vramTotalGb = (vramTotal / 1e9).toFixed(1);

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

        <button
          onClick={() => setShowLoadById(v => !v)}
          className="btn-primary py-2 px-3.5 flex items-center gap-1.5 text-xs shrink-0 font-bold cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.5} />
          Load by ID
        </button>
      </div>

      {(fetchError || actionError) && (
        <div className="flex items-center gap-2 glass-panel aurora-glass p-3 text-xs text-danger font-semibold">
          <AlertCircle size={15} className="shrink-0" />
          <span className="truncate" title={actionError ?? fetchError ?? ''}>
            {actionError ?? fetchError}
          </span>
        </div>
      )}

      {showLoadById && (
        <div className="glass-panel aurora-glass p-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="model id (e.g. qwen2.5-3b-instruct)"
            className="flex-1 min-w-[240px] glass-pill py-2 px-3 text-xs font-semibold text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLoadById();
            }}
          />
          <Select
            options={[
              { value: 'llm', label: 'LLM' },
              { value: 'image', label: 'Image' },
              { value: 'tts', label: 'Voice (TTS)' },
            ]}
            value={customType}
            onChange={(val) => setCustomType(val as ModelKind)}
            className="w-36"
          />
          <button
            onClick={handleLoadById}
            disabled={!customId.trim() || busyId !== null}
            className="btn-primary py-2 px-4 text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {busyId === customId.trim() && busyId !== '' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            Load
          </button>
        </div>
      )}

      {/* Main Grid + Memory Sidebar */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Column: Model Cards */}
        <div className="flex-1 overflow-y-auto min-w-0 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr">
            {filteredModels.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                busy={busyId === model.id}
                onLoad={() => handleLoadModel(model)}
                onOffload={() => handleOffloadModel(model.id)}
                onUnload={() => handleUnloadModel(model.id)}
              />
            ))}
            {filteredModels.length === 0 && (
              <div className="col-span-full glass-panel aurora-glass p-6 text-center text-xs text-text-secondary">
                No models match this filter.
              </div>
            )}
          </div>
        </div>

        {/* Right Info Panel */}
        <div className="w-80 flex-shrink-0 glass-panel aurora-glass p-4 overflow-y-auto space-y-4 text-xs">
          {/* Live VRAM usage (telemetry) */}
          <div className="space-y-3">
            <div className="font-bold text-text-primary flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
              <Zap size={14} className="text-primary" />
              VRAM Usage
            </div>
            <div>
              <div className="flex justify-between text-text-secondary mb-1 font-medium">
                <span>Used</span>
                <span className="font-mono font-bold text-text-primary">
                  {vramTotal > 0 ? `${vramUsedGb} / ${vramTotalGb} GB` : '—'}
                </span>
              </div>
              <ProgressBar
                value={vramTotal > 0 ? vramUsed : 0}
                max={vramTotal > 0 ? vramTotal : 1}
                color="primary"
                height={6}
              />
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
                      <div className="text-[10px] text-text-secondary truncate">{model.role}</div>
                    </div>
                    <span className="font-mono text-[11px] text-primary font-bold">
                      {(model.vramBytes / 1e9).toFixed(1)} GB
                    </span>
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

          {/* Disk footprint of registered models */}
          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary flex items-center gap-2">
              <HardDrive size={14} className="text-primary" />
              Registry Summary
            </div>
            <div className="space-y-1.5 text-text-secondary font-medium">
              <div className="flex justify-between">
                <span>Registered models</span>
                <span className="font-mono text-text-primary font-bold">{modelsList.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Loaded (VRAM)</span>
                <span className="font-mono text-text-primary font-bold">{activeVramLoaded.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Resident footprint</span>
                <span className="font-mono text-text-primary font-bold">
                  {(activeVramLoaded.reduce((sum, m) => sum + m.vramBytes, 0) / 1e9).toFixed(1)} GB
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModelCard: FC<{
  model: CardModel;
  busy: boolean;
  onLoad: () => void;
  onOffload: () => void;
  onUnload: () => void;
}> = ({ model, busy, onLoad, onOffload, onUnload }) => {
  const isRunning = model.status === 'running';
  const isOffloaded = model.status === 'offloaded';
  const { ref, onPointerMove } = useCardSpotlight();

  const reqVramLabel = isRunning || isOffloaded
    ? `${(model.vramBytes / 1e9).toFixed(1)} GB`
    : `≈ ${model.estimateVramGb.toFixed(1)} GB`;

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
          {model.sizeLabel}
        </Pill>
      </div>

      {/* Middle Content: Title & Description in Normal Document Flow */}
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-sm text-text-primary truncate">{model.name}</h4>
        <p className="text-[11px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">{model.role}</p>
        <p className="text-[10px] text-text-secondary font-mono mt-1 truncate" title={model.id}>{model.id}</p>
      </div>

      {/* Bottom Action Area: mt-auto Ensures Pinned to Bottom */}
      <div className="mt-auto pt-3.5 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="text-xs flex items-center gap-1.5 shrink-0">
          <span className="text-text-secondary">Req VRAM:</span>
          <Pill variant="primary" mono size="xs" className="font-bold shrink-0">
            {reqVramLabel}
          </Pill>
        </div>

        {/* Action Button Stack (Load, Offload, Unload) */}
        <div className="flex items-center gap-1.5 flex-wrap ml-auto shrink-0">
          {busy && (
            <span className="flex items-center gap-1.5 text-[11px] text-text-secondary font-semibold">
              <Loader2 size={13} className="animate-spin" />
              Working…
            </span>
          )}

          {!busy && isRunning && (
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

          {!busy && isOffloaded && (
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

          {!busy && model.status === 'available' && (
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
