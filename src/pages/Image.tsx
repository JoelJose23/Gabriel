import type { FC } from 'react';
import { useEffect, useState } from 'react';
import {
  Image as ImageIcon,
  Download,
  RotateCcw,
  Sparkles,
  Sliders,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ModelBadge } from '../components/shared';
import { Select } from '../components/shared/Select';
import { generateImage, listModels } from '../api';

const aspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
type AspectRatio = typeof aspectRatios[number];

/** Map the aspect ratio to pixel dimensions accepted by POST /v1/images/generations. */
const sizeFor = (ratio: AspectRatio): string =>
  ({
    '1:1': '512x512',
    '16:9': '768x432',
    '9:16': '432x768',
    '4:3': '640x480',
    '3:4': '480x640',
  })[ratio];

interface GalleryImage {
  id: string;
  url: string;
  prompt: string;
  size: string;
  timestamp: number;
}

export const Image: FC = () => {
  const [imageModels, setImageModels] = useState<Array<{ id: string; vramBytes: number; inUse: boolean }>>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [count, setCount] = useState(1);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listModels()
      .then(res => {
        if (!mounted) return;
        const images = res.data
          .filter(m => m.gabriel.model_type === 'image')
          .map(m => ({
            id: m.id,
            vramBytes: m.gabriel.vram_bytes,
            inUse: m.gabriel.in_use,
          }));
        setImageModels(images);
        setSelectedModel(prev => (images.some(m => m.id === prev) ? prev : (images[0]?.id ?? '')));
      })
      .catch(err => {
        console.error('Failed to list models from Gabriel API:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selected = imageModels.find(m => m.id === selectedModel);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating || !selectedModel) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await generateImage({
        prompt: trimmed,
        model: selectedModel,
        n: count,
        size: sizeFor(aspectRatio),
      });
      const additions: GalleryImage[] = res.data.map((d, i) => ({
        id: `${Date.now()}-${i}`,
        url: `data:image/png;base64,${d.b64_json}`,
        prompt: trimmed,
        size: sizeFor(aspectRatio),
        timestamp: Date.now(),
      }));
      setGallery(prev => [...additions, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('Image generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = (gen: GalleryImage) => {
    setPrompt(gen.prompt);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary select-none min-h-[540px]">
      {/* Top Header Shelf */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel aurora-glass p-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <Select
            options={
              imageModels.length > 0
                ? imageModels.map(m => ({ value: m.id, label: m.id }))
                : [{ value: '', label: 'No image model loaded' }]
            }
            value={selectedModel}
            onChange={setSelectedModel}
            className="w-56"
          />
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-danger font-semibold truncate max-w-[420px]" title={error}>
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas & Settings */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Column: Canvas & Prompt (Flex column filling height) */}
        <div className="flex-1 flex flex-col gap-4 h-full min-h-0 overflow-hidden">
          {/* Grid Canvas */}
          <div className="glass-panel aurora-glass p-4 flex-1 min-h-0 overflow-y-auto">
            {gallery.length === 0 ? (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-text-secondary space-y-3">
                <div className="w-12 h-12 rounded-full bg-[var(--color-secondary-bg)] text-secondary flex items-center justify-center">
                  <ImageIcon size={24} />
                </div>
                <h3 className="font-bold text-base text-text-primary">No generations yet</h3>
                <p className="text-xs max-w-sm">Describe an image and hit Generate — it renders locally on your GPU.</p>
                {!selectedModel && (
                  <p className="text-[10px] font-mono text-warning">Load an image model from the Models page first.</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
                {gallery.slice(0, 8).map((gen) => (
                  <div
                    key={gen.id}
                    className="relative aspect-square rounded-2xl overflow-hidden glass-panel group border border-[var(--color-border)] shadow-xs"
                  >
                    <img src={gen.url} alt={gen.prompt} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={gen.url}
                        download={`gabriel-${gen.id}.png`}
                        className="p-1.5 rounded-full glass-pill text-text-primary hover:bg-white transition-colors cursor-pointer"
                        aria-label="Download"
                      >
                        <Download size={13} strokeWidth={2} />
                      </a>
                      <button
                        onClick={() => handleRegenerate(gen)}
                        className="p-1.5 rounded-full glass-pill text-text-primary hover:bg-white transition-colors cursor-pointer"
                        aria-label="Reuse prompt"
                        title="Reuse this prompt"
                      >
                        <RotateCcw size={13} strokeWidth={2} />
                      </button>
                    </div>
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 text-[11px] text-white font-semibold truncate drop-shadow-md">
                      {gen.prompt}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prompt Bar */}
          <div className="glass-panel aurora-glass p-4 space-y-3 flex-shrink-0 mt-auto">
            <textarea
              placeholder="Describe the image you want to generate locally..."
              className="w-full glass-panel p-3 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none font-medium"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-secondary">
                Size: <span className="font-mono text-text-primary">{sizeFor(aspectRatio)}</span>
              </span>

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

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim() || !selectedModel}
              className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 text-xs font-semibold shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} strokeWidth={2} className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles size={16} strokeWidth={2} />
                  Generate Image
                </>
              )}
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

            <div className="flex justify-between text-text-secondary font-medium">
              <span>Resolution</span>
              <span className="font-mono font-bold text-text-primary">{sizeFor(aspectRatio)}</span>
            </div>
            <div className="flex justify-between items-center text-text-secondary font-medium">
              <span>Images per request</span>
              <Select
                options={[
                  { value: '1', label: '1' },
                  { value: '2', label: '2' },
                  { value: '3', label: '3' },
                  { value: '4', label: '4' },
                ]}
                value={count.toString()}
                onChange={val => setCount(Number(val))}
                className="w-16"
              />
            </div>
            <div className="flex justify-between text-text-secondary font-medium">
              <span>Sampler / steps / CFG</span>
              <span className="badge font-mono font-bold" title="Engine-managed (LCM scheduler)">engine-set</span>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">Model Info</div>
            <ModelBadge
              type="Image"
              status={selected?.inUse ? 'running' : selectedModel ? 'idle' : 'available'}
              size="md"
            />
            <div className="space-y-1.5 text-text-secondary pt-1 font-medium">
              <div className="flex justify-between">
                <span>VRAM Footprint</span>
                <span className="font-mono text-text-primary font-bold">
                  {selected ? `${(selected.vramBytes / 1e9).toFixed(1)} GB` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Resolution</span>
                <span className="font-mono text-text-primary font-bold">{sizeFor(aspectRatio)}</span>
              </div>
            </div>
          </div>

          {/* Recent History Chips */}
          <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="font-bold text-text-primary">Recent History</div>
            {gallery.length === 0 ? (
              <div className="text-text-secondary">Nothing generated yet.</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {gallery.slice(0, 4).map(gen => (
                  <button
                    key={gen.id}
                    onClick={() => handleRegenerate(gen)}
                    title={gen.prompt}
                    className="w-16 h-16 rounded-xl aspect-square overflow-hidden relative glass-panel group border border-[var(--color-border)] shrink-0 shadow-xs cursor-pointer"
                  >
                    <img src={gen.url} alt={gen.prompt} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
                      <ImageIcon size={16} strokeWidth={1.5} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
