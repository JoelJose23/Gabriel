import type { FC } from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'primary' | 'secondary' | 'tertiary' | 'gray';
  height?: number;
  className?: string;
  showLabel?: boolean;
  label?: string;
}

const colorClasses = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  tertiary: 'bg-[var(--color-hover)]',
  gray: 'bg-gray-400',
};

export const ProgressBar: FC<ProgressBarProps> = ({
  value,
  max = 100,
  color = 'primary',
  height = 6,
  className = '',
  showLabel = false,
  label,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span>{label || 'Progress'}</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
      <div className="w-full bg-[var(--color-hover)] rounded-full overflow-hidden" style={{ height }}>
        <div
          className={colorClasses[color]}
          style={{ width: `${percentage}%`, height: '100%', transition: 'width 0.3s ease' }}
        />
      </div>
    </div>
  );
};
