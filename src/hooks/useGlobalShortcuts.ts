import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './useTheme';

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (!isCtrlOrMeta) return;

      const key = e.key.toLowerCase();

      // Open Command Palette / Search (Ctrl + K)
      if (key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search"], input[placeholder*="search"]'
        );
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        } else {
          navigate('/');
          setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>(
              'input[placeholder*="Search"], input[placeholder*="search"]'
            );
            el?.focus();
          }, 60);
        }
      }

      // New Chat Session (Ctrl + N)
      else if (key === 'n') {
        e.preventDefault();
        navigate('/chat', { state: { newChat: true, timestamp: Date.now() } });
      }

      // Toggle Light/Dark Theme (Ctrl + T)
      else if (key === 't') {
        e.preventDefault();
        toggleTheme();
      }

      // Open Settings (Ctrl + ,)
      else if (key === ',' || e.key === ',') {
        e.preventDefault();
        navigate('/settings');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, toggleTheme]);
}
