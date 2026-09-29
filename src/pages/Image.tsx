import type { FC } from 'react';
import { useState } from 'react';
import {
  Image as ImageIcon,
  Download,
  Heart,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  Sliders,
} from 'lucide-react';
import { ModelBadge } from '../components/shared';
import { Select } from '../components/shared/Select';
import { allModels, recentGenerations } from '../data/mockData';

const imageModels = allModels.filter(m => m.type === 'Image');
const aspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
type AspectRatio = typeof aspectRatios[number];

export const Image: FC = () => {
  const [selectedModel, setSelectedModel] = useState('sdxl-lightning');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [showNegative, setShowNegative] = useState(false);
  const [steps, setSteps] = useState(8);
  const [cfgScale, setCfgScale] = useState(1.5);
  const [sampler, setSampler] = useState('Euler a');

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary select-none min-h-[540px]">
      {/* Top Header Shelf */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel aurora-glass p-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <Select
            options={imageModels.map(m => ({ value: m.id, label: m.name }))}
            value={selectedModel}
            onChange={setSelectedModel}
            className="w-56"
          />

          <Select
            options={[
              { value: '8', label: '8 steps (Fast)' },
              { value: '16', label: '16 steps' },
              { value: '25', label: '25 steps (Balanced)' },
              { value: '50', label: '50 steps (Quality)' },
            ]}
            value={steps.toString()}
            onChange={(val) => setSteps(Number(val))}
            className="w-44"
          />
        </div>
      </div>

      {/* Main Canvas & Settings */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Column: Canvas & Prompt (Flex column filling height) */}
        <div className="flex-1 flex flex-col gap-4 h-full min-h-0 overflow-hidden">
          {/* 2x2 Grid Canvas (Shrinks and scrolls rather than colliding) */}
          <div className="glass-panel aurora-glass p-4 flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
              {recentGenerations.slice(0, 4).map((gen) => (
                <div
                  key={gen.id}
                  className="relative aspect-square rounded-2xl overflow-hidden glass-panel group border border-[var(--color-border)] shadow-xs"
                >
                  <div className="absolute inset-0" style={{ background: gen.thumbnail }} />
                  <div className="absolute inset-0 flex items-center justify-center text-white/50">
                    <ImageIcon size={36} strokeWidth={1.5} />
                  </div>
                  <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 rounded-full glass-pill text-text-primary hover:bg-white transition-colors cursor-pointer" aria-label="Download">
                      <Download size={13} strokeWidth={2} />
                    </button>
                    <button className="p-1.5 rounded-full glass-pill text-text-primary hover:bg-white transition-colors cursor-pointer" aria-label="Favorite">
                      <Heart size={13} strokeWidth={2} />
                    </button>
                    <button className="p-1.5 rounded-full glass-pill text-text-primary hover:bg-white transition-colors cursor-pointer" aria-label="Regenerate">
                      <RotateCcw size={13} strokeWidth={2} />
                    </button>
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 text-[11px] text-white font-semibold truncate drop-shadow-md">
                    {gen.prompt}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt Bar (flex-shrink-0 and securely pinned at bottom) */}
          <div className="glass-panel aurora-glass p-4 space-y-3 flex-shrink-0 mt-auto">
            <textarea
              placeholder="Describe the image you want to generate locally..."
              className="w-full glass-panel p-3 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none font-medium"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowNegative(!showNegative)}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <SlidersHorizontal size={13} strokeWidth={2} />
                {showNegative ? 'Hide' : 'Show'} negative prompt
              </button>

              <div className="flex items-center gap-1">
                {aspectRatios.map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                      aspectRatio === ratio
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-[var(--color-hover)] text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {showNegative && (
              <textarea
                placeholder="Negative prompt (what to avoid in image)..."
                className="w-full glass-panel p-2.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none font-medium"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={2}
              />
            )}

            <button className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 text-xs font-semibold shrink-0">
              <Sparkles size={16} strokeWidth={2} />
              Generate Image
            </button>
          </div>
        </div>

        {/* Supplementary Info Panel */}
        <div className="w-72 flex-shrink-0 glass-panel aurora-glass p-4 overflow-y-auto space-y-4 text-xs">
          <div className="space-y-3">
            <div className="font-bold text-text-primary flex items-center gap-1.5 border-b border-[var(--color-border)] pb-2">
              <Sliders size={14} className="text-secondary" />
              Generation Parameters
            </div>

            <div>
              <div className="flex justify-between mb-1 text-text-secondary font-medium">
                <span>Sampling Steps</span>
                <span className="font-mono font-bold text-text-primary">{steps}</span>
              </div>
              <input type="range" min="1" max="50" value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-text-secondary font-medium">
                <span>CFG Scale</span>
                <span className="font-mono font-bold text-text-primary">{cfgScale}</span>
              </div>
              <input type="range" min="1" max="20" step="0.5" value={cfgScale} onChange={(e) => setCfgScale(Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
            </div>

            <div>
              <div className="text-text-secondary mb-1 font-medium">Sampler</div>
              <Select
                options={['Euler a', 'Euler', 'DPM++ 2M Karras', 'DPM++ SDE Karras', 'DDIM']}
                value={sampler}
                onChange={setSampler}
                className="w-full"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">Model Info</div>
            <ModelBadge type="Image" status="running" quantization="FP16" size="md" />
            <div className="space-y-1.5 text-text-secondary pt-1 font-medium">
              <div className="flex justify-between">
                <span>VRAM Footprint</span>
                <span className="font-mono text-text-primary font-bold">2.3 GB</span>
              </div>
              <div className="flex justify-between">
                <span>Resolution</span>
                <span className="font-mono text-text-primary font-bold">1024×1024</span>
              </div>
              <div className="flex justify-between">
                <span>Precision</span>
                <span className="badge badge-secondary font-mono font-bold">FP16</span>
              </div>
            </div>
          </div>

          {/* Clean Flexbox Recent History Chips */}
          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">Recent History</div>
            <div className="flex flex-wrap gap-3">
              {recentGenerations.slice(0, 4).map(gen => (
                <div
                  key={gen.id}
                  className="w-16 h-16 rounded-xl aspect-square overflow-hidden relative glass-panel group border border-[var(--color-border)] shrink-0 shadow-xs"
                >
                  <div className="absolute inset-0" style={{ background: gen.thumbnail }} />
                  <div className="absolute inset-0 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
                    <ImageIcon size={16} strokeWidth={1.5} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};