import type { FC } from 'react';
import { useState, useEffect, useRef } from 'react';
import { Square, AlertCircle } from 'lucide-react';

interface AudioWaveformRecorderProps {
  onStop: () => void;
  onCancel: () => void;
}

export const AudioWaveformRecorder: FC<AudioWaveformRecorderProps> = ({ onStop, onCancel }) => {
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isSubscribed) return;
        streamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
          if (!isSubscribed) return;
          animFrameRef.current = requestAnimationFrame(draw);

          analyser.getByteFrequencyData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const barWidth = 3;
          const gap = 2;
          const barCount = 18;
          const startX = (canvas.width - (barCount * (barWidth + gap))) / 2;

          for (let i = 0; i < barCount; i++) {
            const index = Math.floor((i / barCount) * bufferLength);
            const value = dataArray[index] || 0;
            const barHeight = Math.max(4, (value / 255) * (canvas.height - 4));

            const x = startX + i * (barWidth + gap);
            const y = (canvas.height - barHeight) / 2;

            const isDark = document.documentElement.classList.contains('dark');
            ctx.fillStyle = isDark ? '#1F60FF' : '#8B7FE8';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
          }
        };

        draw();
      } catch (err) {
        if (!isSubscribed) return;
        console.error('Microphone access error:', err);
        setPermissionError('Mic access denied or unavailable');
      }
    }

    startRecording();

    return () => {
      isSubscribed = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleStopRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    onStop();
  };

  if (permissionError) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-secondary font-semibold px-2 py-1 bg-[var(--color-hover)] rounded-full border border-[var(--color-border)]">
        <AlertCircle size={14} />
        <span>{permissionError}</span>
        <button onClick={onCancel} className="text-text-secondary hover:text-text-primary ml-1 cursor-pointer font-sans">
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-[#2f2f2f] rounded-full border border-primary/30 border-primary/40 animate-in fade-in duration-200">
      <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
      <span className="text-[10px] font-bold uppercase text-primary tracking-wider">Recording</span>
      <canvas ref={canvasRef} width={100} height={20} className="w-[100px] h-[20px]" />
      <button
        onClick={handleStopRecording}
        className="p-1 rounded-full bg-[#1F60FF] text-white hover:bg-[#2550cc] transition-colors cursor-pointer shrink-0"
        title="Stop recording"
      >
        <Square size={12} fill="currentColor" />
      </button>
    </div>
  );
};
