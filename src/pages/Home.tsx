import type { FC } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Play,
  Settings,
  Mic,
  ArrowRight,
  MessageSquare,
  Image as ImageIcon,
  Box,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  StatusDot,
  RadialGraph,
  ModelBadge,
} from '../components/shared';
import { TopSearchBar } from '../components/layout/TopSearchBar';
import { quickActions, user } from '../data/mockData';
import { listModels, loadModel, offloadModel, getHealth } from '../api';
import type { HealthResponse, ModelKind, ModelListEntry } from '../types/api';
import { useTelemetry } from '../hooks/useTelemetry';
import { useCardSpotlight } from '../hooks/useCardSpotlight';

type BadgeType = 'LLM' | 'Image' | 'Voice';

const kindToBadge: Record<ModelKind, BadgeType> = {
  llm: 'LLM',
  embedding: 'LLM',
  image: 'Image',
  tts: 'Voice',
  asr: 'Voice',
};

const kindLabel: Record<ModelKind, string> = {
  llm: 'Language model',
  embedding: 'Embedding model',
  image: 'Image generation',
  tts: 'Text to speech',
  asr: 'Speech to text',
};

const formatUptime = (secs: number): string => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const clock = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return clock;
};

export const Home: FC = () => {
  const navigate = useNavigate();
  const [workloads, setWorkloads] = useState<ModelListEntry[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stickyInput, setStickyInput] = useState('');
  const { snapshot: telemetry } = useTelemetry(3000);

  const { ref: greetingRef, onPointerMove: onGreetingPointerMove } = useCardSpotlight();
  const { ref: workloadsRef, onPointerMove: onWorkloadsPointerMove } = useCardSpotlight();

  const refresh = useCallback(async () => {
    try {
      const res = await listModels();
      setWorkloads(res.data);
    } catch {
      // greeting shows the unreachable state based on health
    }
  }, []);

  useEffect(() => {
    void refresh();
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
  }, [refresh]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const activeCount = workloads.filter(w => w.gabriel.residency === 'vram').length;
  const vramTotal = telemetry?.vram_total_bytes ?? 0;

  const toggleWorkload = async (entry: ModelListEntry) => {
    const isLoaded = entry.gabriel.residency === 'vram';
    setBusyId(entry.id);
    setActionError(null);
    try {
      if (isLoaded) {
        await offloadModel(entry.id);
      } else {
        await loadModel(entry.id, entry.gabriel.model_type);
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleStickySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = stickyInput.trim();
    if (text) {
      setStickyInput('');
      navigate('/chat', { state: { initialMessage: text } });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-28 text-text-primary select-none">
      <TopSearchBar />

      {/* Greeting Banner */}
      <div
        ref={greetingRef}
        onPointerMove={onGreetingPointerMove}
        className="glass-panel hero-card-gradient p-8 md:p-10 cursor-default"
      >
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary mb-2 tracking-tight">
            {getGreeting()}, {user.name.split(' ')[0]}.
          </h1>
          <p className="text-sm md:text-base text-text-secondary font-medium">
            {health
              ? `Local engine online — API v${health.version}, ${health.loaded_models} model${health.loaded_models === 1 ? '' : 's'} loaded.`
              : 'Cannot reach the Gabriel API at 127.0.0.1:8080 — start the engine to begin.'}
          </p>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        {quickActions.map(action => (
          <QuickActionCard key={action.id} action={action} />
        ))}
      </div>

      {/* Active Workloads Shelf */}
      <div
        ref={workloadsRef}
        onPointerMove={onWorkloadsPointerMove}
        className="glass-panel aurora-glass p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-base text-text-primary">Active Workloads</h2>
            <span className="badge badge-primary font-mono font-bold dynamic-glass-pill">
              {activeCount}
            </span>
          </div>
          <Link to="/models" className="text-xs font-semibold text-primary hover:underline">
            Manage Models
          </Link>
        </div>

        {actionError && (
          <p className="text-xs font-semibold text-danger truncate" title={actionError}>{actionError}</p>
        )}

        <div className="space-y-2.5">
          {workloads.length === 0 && (
            <p className="text-xs text-text-secondary italic py-2">
              No models registered yet — load one from the Models page.
            </p>
          )}

          {workloads.map(model => {
            const isLoaded = model.gabriel.residency === 'vram';
            const inUse = model.gabriel.in_use;
            const busy = busyId === model.id;
            const vramGb = model.gabriel.vram_bytes / 1e9;
            const sharePercent = vramTotal > 0
              ? Math.min(100, (model.gabriel.vram_bytes / vramTotal) * 100)
              : 0;

            return (
              <div
                key={model.id}
                className="flex items-center gap-4 p-3 rounded-2xl bg-[var(--color-hover)]/40 hover:bg-[var(--color-hover)] transition-all border border-transparent hover:border-[var(--color-border)] dynamic-glass-pill"
              >
                <div className="flex-shrink-0">
                  <ModelBadge
                    type={kindToBadge[model.gabriel.model_type]}
                    status={isLoaded ? 'running' : 'idle'}
                    size="sm"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-text-primary truncate">{model.id}</div>
                  <div className="text-xs text-text-secondary truncate">
                    {kindLabel[model.gabriel.model_type]}
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-xs font-medium min-w-[150px]">
                  <StatusDot status={isLoaded ? 'running' : 'idle'} size={6} />
                  <span className={isLoaded ? 'text-secondary font-bold' : 'text-text-secondary'}>
                    {isLoaded
                      ? inUse
                        ? 'Running · in use'
                        : `VRAM · ${model.gabriel.active_jobs} job${model.gabriel.active_jobs === 1 ? '' : 's'}`
                      : 'Paged to RAM'}
                  </span>
                </div>

                <div className="text-xs font-mono text-text-secondary w-24 text-right font-semibold">
                  {isLoaded ? `${vramGb.toFixed(1)} GB VRAM` : '0.0 GB VRAM'}
                </div>

                <div className="hidden md:block flex-shrink-0">
                  <RadialGraph
                    percent={isLoaded ? Math.round(sharePercent) : 0}
                    preset="gpu"
                    size={44}
                    showCenterText={true}
                  />
                </div>

                <button
                  onClick={() => toggleWorkload(model)}
                  disabled={busy}
                  className={`p-2 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                    isLoaded
                      ? 'text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary'
                      : 'text-primary bg-[var(--color-primary-bg)] hover:bg-primary/20'
                  }`}
                  aria-label={isLoaded ? 'Page model out to RAM' : 'Load model into VRAM'}
                  title={isLoaded ? 'Offload to RAM' : 'Load into VRAM'}
                >
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isLoaded ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <Play size={14} strokeWidth={2.5} />
                  )}
                </button>
              </div>
            );
          })}

          <div className="pt-3 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Settings size={14} className="text-text-secondary" />
              <span className="text-text-secondary">Engine uptime:</span>
              <span className="font-bold text-text-primary font-mono">
                {health ? formatUptime(health.uptime_secs) : '—'}
              </span>
              {health && (
                <span className="badge badge-gray font-mono">
                  {health.active_jobs} active job{health.active_jobs === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/settings')}
                className="p-1.5 rounded-lg text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-colors cursor-pointer"
                aria-label="Engine Settings"
              >
                <Settings size={15} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Prompt Bar */}
      <form
        onSubmit={handleStickySubmit}
        className="fixed bottom-4 left-[216px] right-[276px] z-40"
      >
        <div className="max-w-4xl mx-auto glass-floating dynamic-glass-pill p-2.5 shadow-2xl flex items-center gap-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <input
            type="text"
            value={stickyInput}
            onChange={(e) => setStickyInput(e.target.value)}
            placeholder="Ask Gabriel anything locally..."
            className="flex-1 bg-transparent border-none focus:outline-none text-xs font-semibold text-text-primary placeholder:text-text-secondary"
          />

          <button
            type="button"
            disabled
            className="p-2 rounded-full text-text-secondary opacity-40 cursor-not-allowed shrink-0"
            aria-label="Voice input unavailable"
            title="Speech-to-text is not available in this engine build"
          >
            <Mic size={17} strokeWidth={1.5} />
          </button>

          <button
            type="submit"
            disabled={!stickyInput.trim()}
            className="p-2 text-white bg-primary rounded-full disabled:opacity-40 disabled:hover:scale-100 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
            aria-label="Send message"
          >
            <ArrowRight size={16} strokeWidth={2} />
          </button>
        </div>
      </form>
    </div>
  );
};

const QuickActionCard: FC<{ action: typeof quickActions[0] }> = ({ action }) => {
  const { ref, onPointerMove } = useCardSpotlight();

  const isPurple = action.color === 'primary';
  const isGreen = action.color === 'secondary';

  const iconColorClass = isPurple
    ? 'bg-[var(--color-primary-bg)] text-primary'
    : isGreen
    ? 'bg-[var(--color-secondary-bg)] text-secondary'
    : 'bg-[var(--color-hover)] text-text-secondary';

  const renderIcon = () => {
    if (action.icon === 'MessageSquare') return <MessageSquare size={18} strokeWidth={2} />;
    if (action.icon === 'Image') return <ImageIcon size={18} strokeWidth={2} />;
    if (action.icon === 'Mic') return <Sparkles size={18} strokeWidth={2} />;
    return <Box size={18} strokeWidth={2} />;
  };

  return (
    <Link
      ref={ref}
      onPointerMove={onPointerMove}
      to={action.route}
      className="glass-panel aurora-glass dynamic-glass-card p-4 flex flex-col justify-between group cursor-pointer hover:-translate-y-1 transition-all"
    >
      <div className="space-y-3 relative z-10">
        <div className={`w-9 h-9 rounded-xl ${iconColorClass} flex items-center justify-center transition-transform group-hover:scale-105`}>
          {renderIcon()}
        </div>
        <div>
          <h3 className="font-bold text-xs text-text-primary group-hover:text-primary transition-colors">
            {action.label}
          </h3>
          <p className="text-[11px] text-text-secondary mt-1 line-clamp-2 leading-snug">
            {action.description}
          </p>
        </div>
      </div>
    </Link>
  );
};
