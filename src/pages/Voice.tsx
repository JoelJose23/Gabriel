import type { FC } from 'react';
import { useState } from 'react';
import {
  Mic,
  Play,
  Pause,
  Download,
  SkipBack,
  SkipForward,
  Sliders,
  Volume2,
} from 'lucide-react';
import { ModelBadge, Graph } from '../components/shared';
import { Select } from '../components/shared/Select';
import { allModels, voicePresets, recentSynthesis } from '../data/mockData';

const voiceModels = allModels.filter(m => m.type === 'Voice');
const sampleWaveformData = [12, 28, 45, 18, 55, 32, 70, 48, 85, 30, 60, 25, 50, 80, 40, 65, 35, 20, 10];

export const Voice: FC = () => {
  const [selectedModel, setSelectedModel] = useState('kokoro-tts');
  const [text, setText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration] = useState(15.5);
  const [selectedPreset, setSelectedPreset] = useState('af_sarah');
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [stability, setStability] = useState(0.5);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary select-none">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel aurora-glass p-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <Select
            options={voiceModels.map(m => ({ value: m.id, label: m.name }))}
            value={selectedModel}
            onChange={setSelectedModel}
            className="w-56"
          />

          <Select
            options={voicePresets.map(p => ({ value: p.id, label: p.name }))}
            value={selectedPreset}
            onChange={setSelectedPreset}
            className="w-56"
          />
        </div>
      </div>

      {/* Main Synthesize Workspace & Controls */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Column: Synthesizer & Waveform */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-0">
          <div className="glass-panel aurora-glass p-5 space-y-4">
            {/* Input Row */}
            <div className="flex items-center gap-3 glass-panel aurora-glass p-2.5 focus-within:ring-2 focus-within:ring-primary/20">
              <input
                type="text"
                placeholder="Type or paste text to synthesize speech locally..."
                className="flex-1 bg-transparent border-none outline-none text-xs md:text-sm text-text-primary placeholder:text-text-secondary font-medium px-2"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <span className="text-[11px] text-text-secondary font-mono shrink-0 hidden sm:inline mr-1">
                {text.length} chars
              </span>
              <button
                className="btn-primary py-2 px-4 flex items-center gap-2 text-xs font-semibold shrink-0"
                disabled={!text.trim()}
              >
                <Mic size={15} strokeWidth={2.2} />
                Synthesize Speech
              </button>
            </div>

            {/* Dynamic Bar-Wave Audio Visualizer */}
            <div className="pt-2 border-t border-[var(--color-border)]">
              <div
                className="relative h-24 rounded-2xl bg-[var(--color-hover)] overflow-hidden border border-[var(--color-border)] px-4 py-2 flex items-center justify-between gap-1 cursor-pointer select-none"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
                  setCurrentTime(newProgress * duration);
                }}
              >
                {/* 36 Amplitude Bars */}
                {[
                  18, 28, 42, 65, 80, 52, 38, 70, 92, 78, 45, 60, 88, 95, 72, 50,
                  35, 68, 85, 90, 64, 40, 55, 82, 94, 76, 48, 30, 58, 86, 70, 44,
                  32, 50, 26, 16,
                ].map((baseHeight, idx, arr) => {
                  const barProgress = (idx / arr.length) * 100;
                  const currentProgress = (currentTime / duration) * 100;
                  const isPassed = barProgress <= currentProgress;

                  return (
                    <div
                      key={idx}
                      className="flex-1 h-full flex items-center justify-center"
                    >
                      <div
                        className={`w-1 sm:w-1.5 rounded-full transition-all duration-150 ${
                          isPlaying ? 'voice-bar-animating' : ''
                        }`}
                        style={{
                          height: `${baseHeight}%`,
                          minHeight: '6px',
                          background: isPassed
                            ? 'linear-gradient(180deg, #1D9BF0 0%, #10a37f 100%)'
                            : 'linear-gradient(180deg, rgba(29, 155, 240, 0.4) 0%, rgba(16, 163, 127, 0.3) 100%)',
                          boxShadow: isPassed && isPlaying
                            ? '0 0 10px rgba(29, 155, 240, 0.45)'
                            : 'none',
                          animationDelay: `-${(idx * 0.075).toFixed(2)}s`,
                          animationDuration: `${0.75 + (idx % 4) * 0.15}s`,
                        }}
                      />
                    </div>
                  );
                })}

                {/* Progress Playhead Line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_8px_var(--color-primary)] transition-all duration-75 pointer-events-none z-10"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
            </div>

            {/* Transport Controls */}
            <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <button className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-colors cursor-pointer" aria-label="Skip back">
                  <SkipBack size={16} />
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer shrink-0 shadow-xs"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>
                <button className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-colors cursor-pointer" aria-label="Skip forward">
                  <SkipForward size={16} />
                </button>
              </div>

              <input
                type="range"
                min="0"
                max={duration}
                step="0.1"
                value={currentTime}
                onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                className="flex-1 accent-primary cursor-pointer mx-2"
              />

              <div className="text-[11px] text-text-secondary font-mono shrink-0 font-bold whitespace-nowrap">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              <button className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-colors cursor-pointer shrink-0 ml-1" aria-label="Download">
                <Download size={15} />
              </button>
            </div>
          </div>

          {/* Recent Synthesis History */}
          <div className="glass-panel aurora-glass p-4 space-y-3">
            <h3 className="font-bold text-xs text-text-primary">Recent Synthesis History</h3>
            <div className="space-y-2">
              {recentSynthesis.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--color-hover)] transition-colors">
                  <button className="w-7 h-7 rounded-full bg-[var(--color-hover)] text-text-secondary flex items-center justify-center hover:bg-[var(--color-active)] transition-colors shrink-0 cursor-pointer">
                    <Play size={13} className="ml-0.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-text-primary truncate">{item.text}</div>
                    <div className="text-[10px] text-text-secondary font-mono">{item.timestamp}</div>
                  </div>
                  <div className="text-xs text-text-secondary font-mono font-semibold">{item.duration}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Supplementary Info Sidebar */}
        <div className="w-72 flex-shrink-0 glass-panel aurora-glass p-4 overflow-y-auto space-y-4 text-xs">
          <div className="space-y-3">
            <div className="font-bold text-text-primary flex items-center gap-1.5 border-b border-[var(--color-border)] pb-2">
              <Sliders size={14} className="text-primary" />
              Voice Tuning
            </div>

            <div>
              <div className="flex justify-between items-center mb-1 text-text-secondary font-medium">
                <span>Speed</span>
                <span className="font-mono font-bold text-text-primary">{speed}x</span>
              </div>
              <input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1 text-text-secondary font-medium">
                <span>Pitch</span>
                <span className="font-mono font-bold text-text-primary">{pitch > 0 ? `+${pitch}` : pitch}</span>
              </div>
              <input type="range" min="-12" max="12" step="1" value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-text-secondary font-medium">
                <span>Stability</span>
                <span className="font-mono font-bold text-text-primary">{stability}</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={stability} onChange={(e) => setStability(Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">Model Info</div>
            <ModelBadge type="Voice" status="running" quantization="INT8" size="md" />
            <div className="space-y-1.5 text-text-secondary pt-1 font-medium">
              <div className="flex justify-between">
                <span>VRAM</span>
                <span className="font-mono text-text-primary font-bold">0.6 GB</span>
              </div>
              <div className="flex justify-between">
                <span>Sample Rate</span>
                <span className="font-mono text-text-primary font-bold">22 kHz</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary flex items-center justify-between">
              <span>Voice Presets</span>
              <Volume2 size={14} className="text-primary" />
            </div>
            <div className="space-y-1.5">
              {voicePresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer text-left ${
                    selectedPreset === preset.id
                      ? 'bg-[var(--color-primary-bg)] border border-primary/30 font-bold'
                      : 'bg-[var(--color-hover)] hover:bg-[var(--color-active)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[var(--color-hover)] text-text-secondary flex items-center justify-center text-[10px]">
                      <Mic size={12} />
                    </div>
                    <div>
                      <div className="font-bold text-text-primary text-[11px]">{preset.name}</div>
                      <div className="text-[9px] text-text-secondary font-mono">{preset.lang}</div>
                    </div>
                  </div>
                  <Play size={12} className="text-text-secondary" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};