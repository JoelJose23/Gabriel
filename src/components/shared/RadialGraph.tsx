import type { FC, CSSProperties } from 'react';
import { useTheme } from '../../hooks/useTheme';

export interface RadialGraphProps {
  percent: number;
  label?: string;
  sublabel?: string;
  preset?: 'cpu' | 'gpu' | 'npu' | 'temp' | 'power' | 'fan' | string;
  gradientId?: string;
  size?: number;
  className?: string;
  showCenterText?: boolean;
  strokeWidth?: number;
}

const CIRCUMFERENCE = 440;

export const RadialGraph: FC<RadialGraphProps> = ({
  percent,
  label,
  sublabel,
  preset = 'cpu',
  gradientId,
  size = 120,
  className = '',
  showCenterText = true,
  strokeWidth,
}) => {
  const { isDark } = useTheme();
  const safePercent = Math.max(0, Math.min(100, percent));
  const offset = Math.round(CIRCUMFERENCE * (1 - safePercent / 100));

  const targetGradId = gradientId || `grad-${preset}${isDark ? '' : '-light'}`;

  return (
    <div className={`radial-graph-container inline-flex flex-col items-center justify-center ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 180 180"
          className="w-full h-full overflow-visible"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        >
          <circle
            className="track"
            cx="90"
            cy="90"
            r="70"
            fill="none"
            stroke={isDark ? "#333333" : "#ECECEC"}
            strokeWidth={strokeWidth || 18}
          />

          <circle
            className="progress radial-progress"
            cx="90"
            cy="90"
            r="70"
            fill="none"
            stroke={`url(#${targetGradId})`}
            strokeWidth={strokeWidth || 18}
            strokeLinecap="round"
            style={{
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: offset,
              '--target-offset': `${offset}`,
            } as CSSProperties}
          />
        </svg>

        {showCenterText && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="font-mono font-bold text-base md:text-lg tracking-tight text-text-primary">
              {Math.round(safePercent)}%
            </span>
            {sublabel && (
              <span className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider mt-0.5">
                {sublabel}
              </span>
            )}
          </div>
        )}
      </div>

      {label && (
        <span className="mt-2 text-xs font-semibold text-text-primary text-center">
          {label}
        </span>
      )}
    </div>
  );
};