import type { FC } from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  Info,
  Check,
  Sliders,
  Keyboard,
  Settings as SettingsIcon,
  Minus,
  Plus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { settingsSections } from '../data/mockData';
import { useAccentTheme } from '../hooks/useAccentTheme';
import { useTheme } from '../hooks/useTheme';
import { Select } from '../components/shared/Select';
import { getHealth, getConfig, putConfig } from '../api';
import type { EngineConfig, HealthResponse } from '../types/api';

const sections = settingsSections;
type SectionId = typeof sections[number]['id'];

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

const SettingRow: FC<SettingRowProps> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-3.5 border-b border-[var(--color-border)] gap-4">
    <div className="flex-1 min-w-0">
      <div className="font-bold text-xs text-text-primary">{label}</div>
      {description && <div className="text-[11px] text-text-secondary mt-0.5 truncate">{description}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

interface NumberStepperProps {
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  ariaLabel: string;
}

const NumberStepper: FC<NumberStepperProps> = ({ value, onChange, min, max, ariaLabel }) => {
  const changeValue = (delta: number) => {
    const nextValue = Math.max(min, Math.min(max, Number(value || min) + delta));
    onChange(String(nextValue));
  };

  return (
    <div className="number-stepper glass-pill">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="number-stepper-input"
        min={min}
        max={max}
        aria-label={ariaLabel}
      />
      <div className="number-stepper-controls">
        <button type="button" onClick={() => changeValue(1)} aria-label={`Increase ${ariaLabel}`}>
          <Plus size={11} strokeWidth={2.5} />
        </button>
        <button type="button" onClick={() => changeValue(-1)} aria-label={`Decrease ${ariaLabel}`}>
          <Minus size={11} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

interface ShortcutRowProps {
  action: string;
  winKeys: string[];
  macKeys: string[];
  isMac: boolean;
}

const ShortcutRow: FC<ShortcutRowProps> = ({ action, winKeys, macKeys, isMac }) => {
  const keys = isMac ? macKeys : winKeys;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] text-xs gap-3">
      <span className="text-text-primary font-semibold">{action}</span>
      <div className="flex items-center gap-1 shrink-0">
        {keys.map((key, i) => (
          <kbd
            key={i}
            className="px-2 py-0.5 rounded-md text-[10px] font-mono text-text-primary bg-[var(--color-hover)] border border-[var(--color-border)] font-bold shadow-2xs"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
};

const Toggle: FC<{ defaultChecked?: boolean; checked?: boolean; onChange?: (val: boolean) => void }> = ({
  defaultChecked = false,
  checked: propChecked,
  onChange,
}) => {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = propChecked !== undefined;
  const isChecked = isControlled ? propChecked : internalChecked;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    if (!isControlled) setInternalChecked(val);
    if (onChange) onChange(val);
  };

  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={isChecked} onChange={handleChange} />
      <span className="toggle-slider" />
    </label>
  );
};

const idleOptions = [
  { value: '300', label: '5 minutes' },
  { value: '900', label: '15 minutes' },
  { value: '1800', label: '30 minutes' },
  { value: '3600', label: '1 hour' },
  { value: '7200', label: '2 hours' },
];

export const Settings: FC = () => {
  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [isMac, setIsMac] = useState(false);

  // Live engine config (GET/PUT /v1/config)
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Governor form state (watermarks are stored as fractions, shown as %)
  const [vramHighPct, setVramHighPct] = useState(85);
  const [vramLowPct, setVramLowPct] = useState(60);
  const [idleOffload, setIdleOffload] = useState('900');
  const [bandwidthCeiling, setBandwidthCeiling] = useState('100');
  const [maxLoadedModels, setMaxLoadedModels] = useState('3');
  const [autoLoadOnRequest, setAutoLoadOnRequest] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [restartRequired, setRestartRequired] = useState<string[]>([]);

  const { accentColor, setAccentColor, presets } = useAccentTheme();
  const { isDark, toggleTheme } = useTheme();

  const applyConfig = useCallback((cfg: EngineConfig) => {
    setConfig(cfg);
    setVramHighPct(Math.round(cfg.vram_high_watermark * 100));
    setVramLowPct(Math.round(cfg.vram_low_watermark * 100));
    setIdleOffload(String(cfg.idle_offload_after_secs));
    setBandwidthCeiling(String(cfg.bandwidth_ceiling_percent));
    setMaxLoadedModels(String(cfg.max_loaded_models));
    setAutoLoadOnRequest(cfg.auto_load_on_request);
  }, []);

  useEffect(() => {
    let mounted = true;
    getConfig()
      .then(cfg => {
        if (mounted) applyConfig(cfg);
      })
      .catch(err => {
        if (mounted) {
          setLoadError(
            err instanceof Error ? err.message : 'Cannot reach the Gabriel API at http://127.0.0.1:8080',
          );
        }
      });
    getHealth()
      .then(h => {
        if (mounted) setHealth(h);
      })
      .catch(() => {
        if (mounted) setHealth(null);
      });
    if (typeof navigator !== 'undefined') {
      const platform = navigator.platform || navigator.userAgent || '';
      setIsMac(/Mac|iPod|iPhone|iPad/.test(platform));
    }
    return () => {
      mounted = false;
    };
  }, [applyConfig]);

  const handleSave = async () => {
    if (!config) return;
    if (vramLowPct >= vramHighPct) {
      setSaveError('VRAM low watermark must be below the high watermark.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const next: EngineConfig = {
        ...config,
        vram_high_watermark: vramHighPct / 100,
        vram_low_watermark: vramLowPct / 100,
        idle_offload_after_secs: Number(idleOffload),
        bandwidth_ceiling_percent: Number(bandwidthCeiling),
        max_loaded_models: Number(maxLoadedModels),
        auto_load_on_request: autoLoadOnRequest,
      };
      const res = await putConfig(next);
      applyConfig(res.config);
      setRestartRequired(res.restart_required);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const getSectionIcon = (id: SectionId) => {
    switch (id) {
      case 'general':    return <SettingsIcon size={16} />;
      case 'appearance': return <Info size={16} />;
      case 'governor':   return <Sliders size={16} />;
      case 'shortcuts':  return <Keyboard size={16} />;
    }
  };

  const idleSelectOptions = idleOptions.some(o => o.value === idleOffload)
    ? idleOptions
    : [...idleOptions, { value: idleOffload, label: `${Math.round(Number(idleOffload) / 60)} minutes` }];

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-1">
            <SettingRow label="Backend API" description="Base URL used by this UI to reach the engine">
              <span className="badge badge-gray font-mono text-[10px]">http://127.0.0.1:8080</span>
            </SettingRow>

            <SettingRow label="Chat History" description="Sessions and messages are kept in this browser only">
              <span className="badge badge-gray font-mono text-[10px]">localStorage</span>
            </SettingRow>

            <SettingRow label="Engine Version" description="Version reported by GET /health">
              <span className="badge badge-gray font-mono text-[10px]">
                {health ? `v${health.version}` : '—'}
              </span>
            </SettingRow>

            <SettingRow label="Config File" description="Persisted engine configuration on disk">
              <span className="badge badge-gray font-mono text-[10px] truncate max-w-[200px]">
                ~/.config/gabriel/config.json
              </span>
            </SettingRow>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-1">
            <SettingRow label="Theme Mode" description="Toggle between light and dark mode">
              <Toggle checked={isDark} onChange={toggleTheme} />
            </SettingRow>

            <SettingRow label="Accent Color" description="Changes app primary accent color globally">
              <div className="flex items-center gap-2.5">
                {presets.map(preset => {
                  const isSelected = accentColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setAccentColor(preset.hex)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer shadow-sm relative ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-offset-[var(--color-card)] ring-[var(--color-text-primary)] scale-110'
                          : 'hover:opacity-90 opacity-80'
                      }`}
                      style={{
                        backgroundColor: preset.hex,
                        border: isSelected ? '2px solid white' : '1px solid rgba(255, 255, 255, 0.25)',
                      }}
                      title={preset.label}
                      aria-label={`Set accent color to ${preset.label}`}
                    >
                      {isSelected && <Check size={14} className="text-white drop-shadow-sm" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </SettingRow>
          </div>
        );

      case 'governor':
        return (
          <div className="space-y-2">
            <div className="p-3 rounded-2xl bg-[var(--color-primary-bg)] border border-primary/20 text-xs text-text-primary mb-3">
              <div className="font-bold flex items-center gap-1.5 text-primary">
                <Sliders size={15} />
                Engine Governor Tunables (core::EngineConfig)
              </div>
              <p className="text-text-secondary text-[11px] mt-1">
                Watermarks, idle offload, bandwidth ceiling and model limits are hot-applied by the Rust
                engine and persisted to disk on save.
              </p>
            </div>

            {loadError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--color-hover)] text-xs text-danger font-semibold">
                <AlertCircle size={14} className="shrink-0" />
                <span className="truncate" title={loadError}>{loadError}</span>
              </div>
            )}

            <SettingRow label="VRAM High Watermark" description="Threshold percentage to trigger automatic model offloading">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="50"
                  max="98"
                  value={vramHighPct}
                  onChange={(e) => setVramHighPct(Number(e.target.value))}
                  className="w-28 accent-primary cursor-pointer"
                />
                <span className="badge badge-primary font-mono font-bold w-12 text-center">
                  {vramHighPct}%
                </span>
              </div>
            </SettingRow>

            <SettingRow label="VRAM Low Watermark" description="Target baseline VRAM utilization after paging out">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="30"
                  max="80"
                  value={vramLowPct}
                  onChange={(e) => setVramLowPct(Number(e.target.value))}
                  className="w-28 accent-primary cursor-pointer"
                />
                <span className="badge badge-secondary font-mono font-bold w-12 text-center">
                  {vramLowPct}%
                </span>
              </div>
            </SettingRow>

            <SettingRow label="Idle Offload Timeout" description="Inactivity duration before paging model to System RAM">
              <Select
                options={idleSelectOptions}
                value={idleOffload}
                onChange={setIdleOffload}
                className="w-40"
              />
            </SettingRow>

            <SettingRow label="Bandwidth Ceiling" description="Maximum memory bus utilization the governor will allow">
              <div className="flex items-center gap-2">
                <NumberStepper
                  value={bandwidthCeiling}
                  onChange={setBandwidthCeiling}
                  min={10}
                  max={100}
                  ariaLabel="Bandwidth ceiling"
                />
                <span className="text-xs font-mono text-text-secondary font-semibold">% of bus</span>
              </div>
            </SettingRow>

            <SettingRow label="Max Loaded Models" description="Maximum concurrent active models in memory">
              <NumberStepper
                value={maxLoadedModels}
                onChange={setMaxLoadedModels}
                min={1}
                max={8}
                ariaLabel="Maximum loaded models"
              />
            </SettingRow>

            <SettingRow label="Auto-load on Request" description="Automatically page model into VRAM when prompted">
              <Toggle checked={autoLoadOnRequest} onChange={setAutoLoadOnRequest} />
            </SettingRow>

            {/* Save */}
            <div className="pt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={handleSave}
                disabled={!config || saving}
                className="btn-primary py-2 px-5 text-xs font-bold cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save Changes
              </button>
              {saved && !saveError && (
                <span className="text-xs font-semibold text-secondary flex items-center gap-1.5">
                  <Check size={14} />
                  Saved &amp; applied
                </span>
              )}
              {saveError && (
                <span className="text-xs font-semibold text-danger flex items-center gap-1.5 truncate" title={saveError}>
                  <AlertCircle size={14} className="shrink-0" />
                  {saveError}
                </span>
              )}
            </div>
            {restartRequired.length > 0 && (
              <div className="p-3 rounded-xl bg-[var(--color-hover)] border border-[var(--color-border)] text-[11px] text-text-secondary">
                <span className="font-bold text-text-primary">Restart required for:</span>{' '}
                <span className="font-mono">{restartRequired.join(', ')}</span> — these changes are saved and
                will take effect the next time the engine starts.
              </div>
            )}
          </div>
        );

      case 'shortcuts':
        return (
          <div className="space-y-1">
            <ShortcutRow action="Open Command Palette / Search" winKeys={['Ctrl', 'K']} macKeys={['⌘', 'K']} isMac={isMac} />
            <ShortcutRow action="New Chat Session" winKeys={['Ctrl', 'N']} macKeys={['⌘', 'N']} isMac={isMac} />
            <ShortcutRow action="Toggle Light/Dark Theme" winKeys={['Ctrl', 'T']} macKeys={['⌘', 'T']} isMac={isMac} />
            <ShortcutRow action="Open Settings" winKeys={['Ctrl', ',']} macKeys={['⌘', ',']} isMac={isMac} />
            <ShortcutRow action="Send Prompt" winKeys={['Ctrl', 'Enter']} macKeys={['⌘', 'Enter']} isMac={isMac} />
            <ShortcutRow action="Stop Generation" winKeys={['Ctrl', '.']} macKeys={['⌘', '.']} isMac={isMac} />
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between glass-panel aurora-glass p-3.5">
        <div className="flex items-center gap-2.5">
          <SettingsIcon className="text-primary" size={20} />
          <h1 className="font-bold text-lg text-text-primary">Engine & Application Settings</h1>
        </div>
        <span className={`text-xs font-bold flex items-center gap-1.5 ${health ? 'text-secondary' : 'text-danger'}`}>
          {health ? `Engine v${health.version} · ${health.api}` : 'Backend unreachable'}
        </span>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Section Navigation Tabs */}
        <nav className="w-52 shrink-0 glass-panel aurora-glass p-3 space-y-1" aria-label="Settings sections">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as SectionId)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                activeSection === section.id
                  ? 'bg-[var(--color-primary-bg)] text-primary font-bold'
                  : 'text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary'
              }`}
            >
              {getSectionIcon(section.id as SectionId)}
              <span>{section.label}</span>
            </button>
          ))}
        </nav>

        {/* Main Section Content Box */}
        <div className="flex-1 glass-panel aurora-glass p-5 overflow-y-auto min-w-0">
          {renderSectionContent()}
        </div>

        {/* Right Info Sidebar */}
        <div className="w-72 flex-shrink-0 glass-panel aurora-glass p-4 overflow-y-auto space-y-4 text-xs">
          {/* Engine Details */}
          <div className="space-y-2">
            <div className="font-bold text-text-primary flex items-center justify-between border-b border-[var(--color-border)] pb-2">
              <span>Backend Specifications</span>
              <Info size={14} className="text-primary" />
            </div>
            <div className="space-y-1.5 text-text-secondary">
              <div className="flex justify-between py-1 border-b border-[var(--color-border)]">
                <span>Engine</span>
                <span className="font-semibold text-text-primary">Gabriel Rust Engine</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--color-border)]">
                <span>Version</span>
                <span className="font-mono font-bold text-text-primary">
                  {health ? `v${health.version}` : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--color-border)]">
                <span>API</span>
                <span className="font-mono font-semibold text-primary">{health ? health.api : '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--color-border)]">
                <span>Uptime</span>
                <span className="font-mono font-bold text-text-primary">
                  {health ? `${Math.floor(health.uptime_secs / 60)} min` : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span>Telemetry</span>
                <span className="text-text-primary font-semibold">Local Only</span>
              </div>
            </div>
          </div>

          {/* Live snapshot */}
          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">Live Engine Snapshot</div>
            <div className="space-y-1.5">
              {[
                { name: 'Loaded models', value: health ? String(health.loaded_models) : '—' },
                { name: 'Active jobs', value: health ? String(health.active_jobs) : '—' },
                { name: 'Config source', value: 'disk + hot-apply' },
              ].map(item => (
                <div key={item.name} className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-hover)]">
                  <span className="text-text-primary font-semibold text-[11px]">{item.name}</span>
                  <span className="font-mono font-bold text-[10px] text-text-secondary">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
