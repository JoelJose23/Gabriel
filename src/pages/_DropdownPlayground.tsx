import type { FC } from 'react';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Select, AttachMenuPopover, usePopover, FloatingPanel } from '../components/shared';
import {
  playgroundLlmModels,
  playgroundImageModels,
  playgroundSteps,
  playgroundVoiceModels,
  playgroundVoicePresets,
  playgroundEngineModes,
  playgroundSamplers,
  playgroundSpeeds,
  playgroundPitches,
  playgroundStartupRoutes,
  playgroundModelFilters,
  playgroundNotifications,
} from '../data/playgroundMocks';

/**
 * TEMPORARY test harness — renders every dropdown/popover in the app side by
 * side so open/close/positioning/exclusivity can be verified on one screen.
 * Not linked from any nav; reachable at /playground. Delete before release.
 */
export const DropdownPlayground: FC = () => {
  const [model, setModel] = useState('llama-3.1-70b');
  const [imageModel, setImageModel] = useState('sdxl-lightning');
  const [steps, setSteps] = useState('8');
  const [voiceModel, setVoiceModel] = useState('kokoro-tts');
  const [preset, setPreset] = useState('af_sarah');
  const [engineMode, setEngineMode] = useState('balanced');
  const [sampler, setSampler] = useState('euler-a');
  const [speed, setSpeed] = useState('1.0');
  const [pitch, setPitch] = useState('0');
  const [route, setRoute] = useState('/');
  const [filter, setFilter] = useState('all');
  const [lastAttach, setLastAttach] = useState<string>('(none yet)');
  const [capsuleClicks, setCapsuleClicks] = useState(0);

  const notifPopover = usePopover({ align: 'right', minWidth: 320, maxHeight: 420, offset: 8 });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 text-text-primary">
      <div className="bg-[var(--color-card)] rounded-2xl p-5 border border-[var(--color-border)]">
        <h1 className="font-bold text-lg">Dropdown Playground (temporary)</h1>
        <p className="text-xs text-text-secondary mt-1">
          Every panel below runs on the single shared usePopover primitive. Verify: first-click opens, option
          selects + closes only its own panel, outside-click closes, Escape closes, opening one closes the others,
          scroll/resize repositions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlaygroundCard title="Model picker (10 options)" readout={model}>
          <Select options={playgroundLlmModels} value={model} onChange={setModel} className="w-full" />
        </PlaygroundCard>

        <PlaygroundCard title="Image model + steps" readout={`${imageModel} / ${steps}`}>
          <div className="flex gap-2">
            <Select options={playgroundImageModels} value={imageModel} onChange={setImageModel} className="w-full" />
            <Select options={playgroundSteps} value={steps} onChange={setSteps} className="w-full" />
          </div>
        </PlaygroundCard>

        <PlaygroundCard title="Voice model + preset" readout={`${voiceModel} / ${preset}`}>
          <div className="flex gap-2">
            <Select options={playgroundVoiceModels} value={voiceModel} onChange={setVoiceModel} className="w-full" />
            <Select options={playgroundVoicePresets} value={preset} onChange={setPreset} className="w-full" />
          </div>
        </PlaygroundCard>

        <PlaygroundCard title="Engine mode + sampler" readout={`${engineMode} / ${sampler}`}>
          <div className="flex gap-2">
            <Select options={playgroundEngineModes} value={engineMode} onChange={setEngineMode} className="w-full" />
            <Select options={playgroundSamplers} value={sampler} onChange={setSampler} className="w-full" />
          </div>
        </PlaygroundCard>

        <PlaygroundCard title="Speed + pitch" readout={`${speed}x / ${pitch}`}>
          <div className="flex gap-2">
            <Select options={playgroundSpeeds} value={speed} onChange={setSpeed} className="w-full" />
            <Select options={playgroundPitches} value={pitch} onChange={setPitch} className="w-full" />
          </div>
        </PlaygroundCard>

        <PlaygroundCard title="Startup route + filter" readout={`${route} / ${filter}`}>
          <div className="flex gap-2">
            <Select options={playgroundStartupRoutes} value={route} onChange={setRoute} className="w-full" />
            <Select options={playgroundModelFilters} value={filter} onChange={setFilter} className="w-full" />
          </div>
        </PlaygroundCard>

        <PlaygroundCard title="AttachMenuPopover" readout={lastAttach}>
          <div className="flex items-center gap-3 rounded-full bg-[var(--color-hover)] border border-[var(--color-border)] px-3 py-2">
            <AttachMenuPopover iconSize={16} onSelect={(opt) => setLastAttach(opt)} />
            <span className="text-xs text-text-secondary">input capsule mock</span>
          </div>
        </PlaygroundCard>

        <PlaygroundCard title="Raw usePopover notifications (8 items)" readout={notifPopover.isOpen ? 'open' : 'closed'}>
          <div>
            <button
              type="button"
              {...notifPopover.triggerProps}
              className="p-2.5 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] text-text-secondary hover:text-text-primary cursor-pointer"
              aria-label="Notifications"
            >
              <Bell size={18} strokeWidth={2} />
            </button>
            <FloatingPanel
              api={notifPopover}
              role="dialog"
              className="w-80 bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl p-4 space-y-2 shadow-2xl"
            >
              {playgroundNotifications.map((n) => (
                <div key={n.id} className="p-2.5 rounded-xl bg-[var(--color-hover)] text-left">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs text-text-primary">{n.title}</span>
                    <span className="text-[10px] text-text-secondary font-mono">{n.time}</span>
                  </div>
                  <p className="text-[11px] text-text-secondary truncate mt-0.5">{n.message}</p>
                </div>
              ))}
            </FloatingPanel>
          </div>
        </PlaygroundCard>
      </div>

      <div className="bg-[var(--color-card)] rounded-2xl p-5 border border-[var(--color-border)] space-y-2">
        <h2 className="font-bold text-sm">Capsule leak test</h2>
        <p className="text-xs text-text-secondary">
          The wrapper below counts its own clicks. Use the Select inside it — the counter must stay at 0, proving
          portal clicks never leak to a wrapping capsule.
        </p>
        <div
          onClick={() => setCapsuleClicks((c) => c + 1)}
          className="rounded-full bg-[var(--color-hover)] border border-[var(--color-border)] px-3 py-2"
        >
          <Select options={playgroundLlmModels} value={model} onChange={setModel} className="w-64" />
        </div>
        <div className="text-xs font-mono" data-testid="capsule-click-count">
          capsule clicks: {capsuleClicks} (must stay 0)
        </div>
      </div>
    </div>
  );
};

const PlaygroundCard: FC<{ title: string; readout: string; children: React.ReactNode }> = ({
  title,
  readout,
  children,
}) => (
  <div className="bg-[var(--color-card)] rounded-2xl p-4 border border-[var(--color-border)] space-y-2">
    <div className="font-semibold text-xs">{title}</div>
    {children}
    <div className="text-[11px] font-mono text-text-secondary truncate">selected: {readout}</div>
  </div>
);
