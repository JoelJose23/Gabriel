import type { FC } from 'react';

export const GlobalGradients: FC = () => {
  return (
    <svg width="0" height="0" className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <defs>
        {/* Dark mode gradients (used when .dark class is present) */}
        <linearGradient id="grad-cpu" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1F60FF" />
        </linearGradient>
        <linearGradient id="grad-gpu" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1F60FF" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="grad-npu" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1F60FF" />
        </linearGradient>
        <linearGradient id="grad-temp" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="grad-power" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1F60FF" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="grad-fan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#3FA76B" />
        </linearGradient>

        {/* Light mode gradients */}
        <linearGradient id="grad-cpu-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B7FE8" />
          <stop offset="100%" stopColor="#3FA76B" />
        </linearGradient>
        <linearGradient id="grad-gpu-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3FA76B" />
          <stop offset="100%" stopColor="#8B7FE8" />
        </linearGradient>
        <linearGradient id="grad-npu-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B7FE8" />
          <stop offset="100%" stopColor="#E8955A" />
        </linearGradient>
        <linearGradient id="grad-temp-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8955A" />
          <stop offset="100%" stopColor="#8B7FE8" />
        </linearGradient>
        <linearGradient id="grad-power-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3FA76B" />
          <stop offset="100%" stopColor="#8B7FE8" />
        </linearGradient>
        <linearGradient id="grad-fan-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B7FE8" />
          <stop offset="100%" stopColor="#3FA76B" />
        </linearGradient>
      </defs>
    </svg>
  );
};