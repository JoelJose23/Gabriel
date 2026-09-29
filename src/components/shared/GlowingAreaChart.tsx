import type { FC } from 'react';
import { Graph } from './Graph';

export interface GlowingAreaChartProps {
  data: number[];
  secondaryData?: number[];
  color?: 'purple' | 'green' | 'orange';
  secondaryColor?: 'purple' | 'green' | 'orange';
  height?: number;
  showPoints?: boolean;
  maxVal?: number;
}

export const GlowingAreaChart: FC<GlowingAreaChartProps> = ({
  data,
  secondaryData,
  color = 'purple',
  secondaryColor = 'green',
  height = 120,
  showPoints = true,
  maxVal,
}) => {
  return (
    <Graph
      data={data}
      secondaryData={secondaryData}
      color={color}
      secondaryColor={secondaryColor}
      height={height}
      responsive={true}
      showPoints={showPoints}
      maxVal={maxVal}
    />
  );
};