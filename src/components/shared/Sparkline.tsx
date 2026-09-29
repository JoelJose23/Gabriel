import type { FC } from 'react';
import { Graph } from './Graph';

interface SparklineProps {
  data: number[];
  color?: 'primary' | 'secondary' | 'tertiary' | 'gray';
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
  showPoints?: boolean;
}

export const Sparkline: FC<SparklineProps> = ({
  data,
  color = 'primary',
  width = 100,
  height = 30,
  className = '',
  strokeWidth = 2.5,
  showPoints = true,
}) => {
  return (
    <Graph
      data={data}
      color={color}
      width={width}
      height={height}
      responsive={false}
      showPoints={showPoints}
      strokeWidth={strokeWidth}
      className={className}
    />
  );
};