import type { FC } from 'react';
import { StatusDot } from './StatusDot';

type ModelType = 'LLM' | 'Image' | 'Voice';
type ModelStatus = 'running' | 'idle' | 'downloading' | 'available' | 'loaded';

interface ModelBadgeProps {
  type: ModelType;
  status?: ModelStatus;
  quantization?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const typeConfig = {
  LLM: { color: 'primary', label: 'LLM' },
  Image: { color: 'secondary', label: 'Image' },
  Voice: { color: 'tertiary', label: 'Voice' },
};

const statusConfig: Record<ModelStatus, { dot: 'running' | 'idle' | 'warning'; label: string; className: string }> = {
  running: { dot: 'running', label: 'Running', className: 'badge-green' },
  idle: { dot: 'idle', label: 'Idle', className: 'badge-gray' },
  downloading: { dot: 'warning', label: 'Downloading', className: 'badge-tertiary' },
  available: { dot: 'idle', label: 'Available', className: 'badge-gray' },
  loaded: { dot: 'running', label: 'Loaded', className: 'badge-green' },
};

export const ModelBadge: FC<ModelBadgeProps> = ({
  type,
  status = 'available',
  quantization,
  className = '',
}) => {
  const config = typeConfig[type];
  const statusInfo = statusConfig[status];

  const typeBgClass = config.color === 'primary' ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-bold' : config.color === 'secondary' ? 'bg-[#3FA76B]/15 text-secondary font-bold' : 'bg-[var(--color-hover)] text-text-secondary font-bold';

  return (
    <div className={`pill-row py-0.5 overflow-visible shrink-0 ${className}`}>
      <span className={`pill aurora-glass text-[11px] ${typeBgClass}`}>
        <StatusDot status={statusInfo.dot} size={5} />
        {config.label}
      </span>

      {quantization && (
        <span className="pill aurora-glass badge-gray font-mono text-[11px] tracking-tight">
          {quantization}
        </span>
      )}

      {status && (
        <span className={`pill aurora-glass text-[11px] ${statusInfo.className}`}>
          <StatusDot status={statusInfo.dot} size={5} />
          {statusInfo.label}
        </span>
      )}
    </div>
  );
};
