import type { FC, ReactNode } from 'react';

interface RightPanelCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  footer?: ReactNode;
  noPadding?: boolean;
}

export const RightPanelCard: FC<RightPanelCardProps> = ({
  title,
  children,
  className = '',
  headerAction,
  footer,
  noPadding = false,
}) => {
  return (
    <div className={`bg-[var(--color-card)] border border-[var(--color-border)] ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="card-title">{title}</h3>
        {headerAction}
      </div>
      <div className={noPadding ? '' : 'space-y-4'}>
        {children}
      </div>
      {footer && (
        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          {footer}
        </div>
      )}
    </div>
  );
};
