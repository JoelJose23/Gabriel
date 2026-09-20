import type { FC } from 'react';

export interface GraphProps {
  data: number[];
  secondaryData?: number[];
  color?: 'primary' | 'secondary' | 'tertiary' | 'purple' | 'green' | 'orange' | string;
  secondaryColor?: 'primary' | 'secondary' | 'tertiary' | 'purple' | 'green' | 'orange' | string;
  width?: number;
  height?: number;
  responsive?: boolean;
  showPoints?: boolean;
  maxVal?: number;
  className?: string;
  strokeWidth?: number;
}

function getComputedPrimary(): string {
  if (typeof document === 'undefined') return '#1F60FF';
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');
  return isDark ? '#1F60FF' : '#8B7FE8';
}

function getComputedSecondary(): string {
  if (typeof document === 'undefined') return '#3FA76B';
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');
  return isDark ? '#3B82F6' : '#3FA76B';
}

const colorHexMap: Record<string, string> = {
  primary: getComputedPrimary(),
  purple: getComputedPrimary(),
  secondary: getComputedSecondary(),
  green: getComputedSecondary(),
  tertiary: '#9CA3AF',
  orange: '#E8955A',
  gray: '#8A8578',
};

function getHexColor(colorProp?: string, defaultHex = '#8B7FE8'): string {
  if (!colorProp) return defaultHex;
  if (colorHexMap[colorProp]) return colorHexMap[colorProp];
  return colorProp.startsWith('#') || colorProp.startsWith('rgb') ? colorProp : defaultHex;
}

function generateSmoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x},${coords[0].y}`;
  if (coords.length === 2) return `M ${coords[0].x},${coords[0].y} L ${coords[1].x},${coords[1].y}`;

  let path = `M ${coords[0].x},${coords[0].y}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const prev = coords[i - 1] || curr;
    const afterNext = coords[i + 2] || next;

    const cp1x = curr.x + (next.x - prev.x) * 0.18;
    const cp1y = curr.y + (next.y - prev.y) * 0.18;
    const cp2x = next.x - (afterNext.x - curr.x) * 0.18;
    const cp2y = next.y - (afterNext.y - curr.y) * 0.18;

    path += ` C ${Math.round(cp1x * 10) / 10},${Math.round(cp1y * 10) / 10} ${Math.round(cp2x * 10) / 10},${Math.round(cp2y * 10) / 10} ${Math.round(next.x * 10) / 10},${Math.round(next.y * 10) / 10}`;
  }

  return path;
}

export const Graph: FC<GraphProps> = ({
  data,
  secondaryData,
  color = 'primary',
  secondaryColor = 'secondary',
  width = 120,
  height = 36,
  responsive = true,
  showPoints = true,
  maxVal: customMaxVal,
  className = '',
  strokeWidth = 2.5,
}) => {
  const primaryHex = getHexColor(color, getComputedPrimary());
  const secondaryHex = getHexColor(secondaryColor, getComputedSecondary());

  const instanceId = `graph-${Math.random().toString(36).substring(2, 9)}`;

  const safeData = data.length ? data : [0, 0];
  const max = customMaxVal || Math.max(...safeData, ...(secondaryData || []), 1);
  const min = Math.min(...safeData, ...(secondaryData || []), 0);
  const range = max - min || 1;

  const viewBoxW = 400;
  const viewBoxH = 200;
  const padY = 16;
  const usableH = viewBoxH - padY * 2;

  const mapToCoords = (dataset: number[]) => {
    if (!dataset.length) return [];
    const stepX = viewBoxW / Math.max(dataset.length - 1, 1);
    return dataset.map((val, idx) => ({
      x: idx * stepX,
      y: viewBoxH - padY - ((val - min) / range) * usableH,
    }));
  };

  const priCoords = mapToCoords(safeData);
  const priLineD = generateSmoothPath(priCoords);
  const priLastX = priCoords[priCoords.length - 1]?.x ?? viewBoxW;
  const priAreaD = `${priLineD} L ${priLastX},${viewBoxH} L 0,${viewBoxH} Z`;

  const secCoords = secondaryData ? mapToCoords(secondaryData) : null;
  const secLineD = secCoords ? generateSmoothPath(secCoords) : '';
  const secLastX = secCoords ? (secCoords[secCoords.length - 1]?.x ?? viewBoxW) : viewBoxW;
  const secAreaD = secCoords ? `${secLineD} L ${secLastX},${viewBoxH} L 0,${viewBoxH} Z` : '';

  const priLastPt = priCoords[priCoords.length - 1];
  const secLastPt = secCoords ? secCoords[secCoords.length - 1] : null;

  return (
    <div
      className={`relative inline-block ${responsive ? 'w-full' : ''} ${className}`}
      style={{ height: `${height}px`, width: responsive ? '100%' : `${width}px` }}
    >
      <svg
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id={`${instanceId}-pri-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryHex} stopOpacity={0.3} />
            <stop offset="100%" stopColor={primaryHex} stopOpacity={0.0} />
          </linearGradient>
          {secCoords && (
            <linearGradient id={`${instanceId}-sec-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={secondaryHex} stopOpacity={0.25} />
              <stop offset="100%" stopColor={secondaryHex} stopOpacity={0.0} />
            </linearGradient>
          )}
        </defs>

        {secCoords && (
          <g>
            <path d={secAreaD} fill={`url(#${instanceId}-sec-grad)`} />
            <path
              d={secLineD}
              fill="none"
              stroke={secondaryHex}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.8}
            />
            {showPoints && secLastPt && (
              <circle cx={secLastPt.x} cy={secLastPt.y} r={4.5} fill="#ECECEC" stroke={secondaryHex} strokeWidth={2.5} />
            )}
          </g>
        )}

        <g>
          <path d={priAreaD} fill={`url(#${instanceId}-pri-grad)`} />
          <path
            d={priLineD}
            fill="none"
            stroke={primaryHex}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {showPoints && priLastPt && (
            <circle cx={priLastPt.x} cy={priLastPt.y} r={5} fill="#ECECEC" stroke={primaryHex} strokeWidth={3} />
          )}
        </g>
      </svg>
    </div>
  );
};