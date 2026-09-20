import type { FC } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export const ThemeToggle: FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative w-14 h-7 rounded-full bg-[var(--color-hover)] border border-[var(--color-border)] transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) cursor-pointer hover:border-[var(--color-text-secondary)] focus-visible:outline-none"
      aria-label="Toggle dark mode"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] flex items-center justify-center transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) ${
          isDark ? 'translate-x-7' : 'translate-x-0'
        }`}
      >
        {isDark ? (
          <Moon size={14} className="text-text-primary" strokeWidth={2} />
        ) : (
          <Sun size={14} className="text-text-secondary" strokeWidth={2} />
        )}
      </div>
    </button>
  );
};