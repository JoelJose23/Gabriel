import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Play,
  Pause,
  Download,
  SkipBack,
  SkipForward,
  Sliders,
  Volume2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ModelBadge } from '../components/shared';
import { Select } from '../components/shared/Select';
import { listModels, synthesizeSpeech } from '../api';

/** Kokoro voices accepted by the engine (`af_`/`am_`/`bf_` pass through). */
const voicePresets = [
  { id: 'af_sarah', name: 'Sarah (US Female)', lang: 'en-US' },
  { id: 'am_adam', name: 'Adam (US Male)', lang: 'en-US' },
  { id: 'bf_emma', name: 'Emma (UK Female)', lang: 'en-GB' },
  { id: 'af_bella', name: 'Bella (US Female)', lang: 'en-US' },
  { id: 'am_michael', name: 'Michael (US Male)', lang: 'en-US' },
];

interface SynthesisItem {
  id: string;
  text: string;
  url: string;
  timestamp: number;
}

export const Voice: FC = () => {
  const [ttsModels, setTtsModels] = useState<Array<{ id: string; vramBytes: number }>>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [text, setText] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('af_sarah');
  const [speed, setSpeed] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SynthesisItem[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let mounted = true;
    listModels()
      .then(res => {
        if (!mounted) return;
        const models = res.data
          .filter(m => m.gabriel.model_type === 'tts')
          .map(m => ({ id: m.id, vramBytes: m.gabriel.vram_bytes }));
        setTtsModels(models);
        setSelectedModel(prev => (models.some(m => m.id === prev) ? prev : (models[0]?.id ?? '')));
      })
      .catch(err => {
        console.error('Failed to list models from Gabriel API:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Keep the <audio> element in sync with the selected URL.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => setIsPlaying(false);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const selected = ttsModels.find(m => m.id === selectedModel);

  const formatTime = (t: number) => {
    if (!Number.isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const loadAndPlay = (url: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentUrl !== url) {
      setCurrentUrl(url);
      audio.src = url;
      audio.currentTime = 0;
      setCurrentTime(0);
    }
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(err => {
        console.error('Playback failed:', err);
        setIsPlaying(false);
      });
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (t: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    const clamped = Math.max(0, Math.min(duration, t));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const handleSynthesize = async () => {
    const trimmed = text.trim();
    if (!trimmed || isGenerating || !selectedModel) return;
    setIsGenerating(true);
    setError(null);
    try {
      const blob = await synthesizeSpeech({
        model: selectedModel,
        input: trimmed,
        voice: selectedPreset,
        speed,
      });
      const url = URL.createObjectURL(blob);
      const item: SynthesisItem = {
        id: `${Date.now()}`,
        text: trimmed,
        url,
        timestamp: Date.now(),
      };
      setHistory(prev => [item, ...prev].slice(0, 20));
      loadAndPlay(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('Speech synthesis failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!currentUrl) return;
    const a = document.createElement('a');
    a.href = currentUrl;
    a.download = `gabriel-speech-${Date.now()}.wav`;
    a.click();
  };

  const barHeights = [
    18, 28, 42, 65, 80, 52, 38, 70, 92, 78, 45, 60, 88, 95, 72, 50,
    35, 68, 85, 90, 64, 40, 55, 82, 94, 76, 48, 30, 58, 86, 70, 44,
    32, 50, 26, 16,
  ];

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary select-none">
      <audio ref={audioRef} preload="metadata" className="hidden" />

      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel aurora-glass p-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <Select
            options={
              ttsModels.length > 0
                ? ttsModels.map(m => ({ value: m.id, label: m.id }))
                : [{ value: '', label: 'No TTS model loaded' }]
            }
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

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-danger font-semibold truncate max-w-[360px]" title={error}>
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSynthesize();
                }}
              />
              <span className="text-[11px] text-text-secondary font-mono shrink-0 hidden sm:inline mr-1">
                {text.length} chars
              </span>
              <button
                onClick={handleSynthesize}
                className="btn-primary py-2 px-4 flex items-center gap-2 text-xs font-semibold shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                disabled={!text.trim() || isGenerating || !selectedModel}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />
                    Synthesizing…
                  </>
                ) : (
                  <>
                    <Mic size={15} strokeWidth={2.2} />
                    Synthesize Speech
                  </>
                )}
              </button>
            </div>

            {/* Dynamic Bar-Wave Audio Visualizer */}
            <div className="pt-2 border-t border-[var(--color-border)]">
              <div
                className="relative h-24 rounded-2xl bg-[var(--color-hover)] overflow-hidden border border-[var(--color-border)] px-4 py-2 flex items-center justify-between gap-1 cursor-pointer select-none"
                onClick={(e) => {
                  if (!duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
                  seekTo(newProgress * duration);
                }}
              >
                {barHeights.map((baseHeight, idx, arr) => {
                  const barProgress = (idx / arr.length) * 100;
                  const currentProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
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
                  style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Transport Controls */}
            <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => seekTo(currentTime - 5)}
                  className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
                  aria-label="Back 5 seconds"
                  title="Back 5s"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  onClick={togglePlay}
                  className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer shrink-0 shadow-xs disabled:opacity-40"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  disabled={!currentUrl}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>
                <button
                  onClick={() => seekTo(currentTime + 5)}
                  className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
                  aria-label="Forward 5 seconds"
                  title="Forward 5s"
                >
                  <SkipForward size={16} />
                </button>
              </div>

              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                disabled={!duration}
                className="flex-1 accent-primary cursor-pointer mx-2 disabled:opacity-40"
              />

              <div className="text-[11px] text-text-secondary font-mono shrink-0 font-bold whitespace-nowrap">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              <button
                onClick={handleDownload}
                disabled={!currentUrl}
                className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-colors cursor-pointer ml-1 disabled:opacity-40"
                aria-label="Download WAV"
                title="Download WAV"
              >
                <Download size={15} />
              </button>
            </div>
          </div>

          {/* Recent Synthesis History */}
          <div className="glass-panel aurora-glass p-4 space-y-3">
            <h3 className="font-bold text-xs text-text-primary">Recent Synthesis History</h3>
            {history.length === 0 ? (
              <div className="text-xs text-text-secondary">Nothing synthesized yet this session.</div>
            ) : (
              <div className="space-y-2">
                {history.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--color-hover)] transition-colors">
                    <button
                      onClick={() => loadAndPlay(item.url)}
                      className="w-7 h-7 rounded-full bg-[var(--color-hover)] text-text-secondary flex items-center justify-center hover:bg-[var(--color-active)] transition-colors shrink-0 cursor-pointer"
                      aria-label="Play"
                    >
                      <Play size={13} className="ml-0.5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-text-primary truncate">{item.text}</div>
                      <div className="text-[10px] text-text-secondary font-mono">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <a
                      href={item.url}
                      download={`gabriel-speech-${item.id}.wav`}
                      className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors shrink-0"
                      title="Download"
                    >
                      <Download size={13} />
                    </a>
                  </div>
                ))}
              </div>
            )}
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

            <div className="text-[10px] text-text-secondary leading-relaxed pt-1">
              Pitch and stability are engine-managed by the Kokoro backend and not exposed through the API.
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">Model Info</div>
            <ModelBadge type="Voice" status={selectedModel ? 'running' : 'available'} size="md" />
            <div className="space-y-1.5 text-text-secondary pt-1 font-medium">
              <div className="flex justify-between">
                <span>VRAM</span>
                <span className="font-mono text-text-primary font-bold">
                  {selected ? `${(selected.vramBytes / 1e9).toFixed(1)} GB` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sample Rate</span>
                <span className="font-mono text-text-primary font-bold">24 kHz</span>
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
