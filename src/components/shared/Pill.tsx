import type { FC, ReactNode } from 'react';

export type PillVariant = 'glass' | 'primary' | 'secondary' | 'tertiary' | 'danger' | 'default';
export type PillSize = 'xs' | 'sm' | 'md';

export interface PillProps {
  variant?: PillVariant;
  size?: PillSize;
  mono?: boolean;
  className?: string;
  children?: ReactNode;
}

const variantStyles: Record<PillVariant, string> = {
  glass: 'bg-[var(--color-glass-pill)] text-text-primary border-[rgba(255,255,255,0.12)] dark:border-[rgba(255,255,255,0.08)] backdrop-blur-md aurora-glass',
  default: 'bg-[var(--color-hover)] text-text-secondary border-[var(--color-border)] aurora-glass',
  primary: 'bg-[var(--color-accent-bg)] text-[var(--color-accent)] border-[var(--color-accent-border,rgba(139,127,232,0.25))] aurora-glass',
  secondary: 'bg-[var(--color-secondary-bg)] text-secondary border-[rgba(16,163,127,0.25)] aurora-glass',
  tertiary: 'bg-[var(--color-hover)] text-text-secondary border-[var(--color-border)] aurora-glass',
  danger: 'bg-[var(--color-hover)] text-text-secondary border-[var(--color-border)] aurora-glass',
};

const sizeStyles: Record<PillSize, string> = {
  xs: 'text-[10px] px-2 py-0.5 rounded-lg',
  sm: 'text-[11px] px-2.5 py-1 rounded-xl',
  md: 'text-xs px-3 py-1.5 rounded-xl',
};

export const Pill: FC<PillProps> = ({
  variant = 'glass',
  size = 'sm',
  mono = false,
  className = '',
  children,
}) => {
  if (children === null || children === undefined || children === '') {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 border whitespace-nowrap flex-shrink-0 font-medium transition-colors shadow-2xs aurora-glass ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${mono ? 'font-mono' : ''} ${className}`}
    >
      {children}
    </span>
  );
};
