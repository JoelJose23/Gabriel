import type { FC } from 'react';

type Status = 'running' | 'idle' | 'warning';

interface StatusDotProps {
  status: Status;
  size?: number;
  className?: string;
}

const statusColors: Record<Status, string> = {
  running: '#3FA76B',
  idle: '#C9C2B5',
  warning: '#E8955A',
};

export const StatusDot: FC<StatusDotProps> = ({ 
  status, 
  size = 8, 
  className = '' 
}) => {
  return (
    <span
      className={`inline-block rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: statusColors[status],
      }}
      aria-label={status}
    />
  );
};