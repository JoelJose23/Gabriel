import type { FC } from 'react';
import { useState, useRef, useEffect } from 'react';
import { Search, Bell, X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { usePopover, FloatingPanel } from '../shared/FloatingPanel';

export const TopSearchBar: FC<{ showNotifications?: boolean }> = ({ showNotifications = true }) => {
  const [query, setQuery] = useState('');
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const notifications = usePopover({ align: 'right', minWidth: 320, maxHeight: 420, offset: 8 });

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const platform = navigator.platform || navigator.userAgent || '';
      setIsMac(/Mac|iPod|iPhone|iPad/.test(platform));
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const notificationsList = [
    { id: '1', title: 'Model Paged', message: 'Llama 3.1 70B Instruct paged to VRAM', time: '2m ago', type: 'success' },
    { id: '2', title: 'VRAM Watermark Alert', message: 'High VRAM watermark reached (82%)', time: '15m ago', type: 'warning' },
    { id: '3', title: 'Governor Active', message: 'Bandwidth Governor throttled background tasks', time: '1h ago', type: 'info' },
  ];

  return (
    <div className="flex items-center gap-3 mb-6 relative z-30">
      <div className="flex-1 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={17} strokeWidth={2} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models, chats, or commands..."
          className="home-search-input w-full glass-pill aurora-glass py-2.5 pl-11 pr-20 text-xs font-medium text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] transition-all"
        />
        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-mono text-text-secondary bg-[var(--color-hover)] border border-[var(--color-border)] font-bold">
          {isMac ? '⌘K' : 'Ctrl+K'}
        </kbd>
      </div>

      {showNotifications && (
        <div className="relative">
          <button
            {...notifications.triggerProps}
            className="relative p-2.5 rounded-full glass-pill aurora-glass text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-colors cursor-pointer flex items-center justify-center"
            aria-label="Notifications"
          >
            <Bell size={17} strokeWidth={2} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-card)]" />
          </button>

          <FloatingPanel
            api={notifications}
            role="dialog"
            className="w-80 glass-floating aurora-glass rounded-2xl p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
              <h3 className="font-bold text-xs text-text-primary uppercase tracking-wider">Notifications</h3>
              <button
                onClick={() => notifications.close()}
                className="p-1 rounded-full text-text-secondary hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {notificationsList.map(n => (
                <div key={n.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[var(--color-hover)] hover:bg-[var(--color-active)] transition-colors text-left">
                  {n.type === 'success' && <CheckCircle2 size={15} className="text-secondary shrink-0 mt-0.5" />}
                  {n.type === 'warning' && <AlertCircle size={15} className="text-text-secondary shrink-0 mt-0.5" />}
                  {n.type === 'info' && <Info size={15} className="text-primary shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-text-primary">{n.title}</span>
                      <span className="text-[10px] text-text-secondary font-mono">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-text-secondary truncate mt-0.5">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </FloatingPanel>
        </div>
      )}
    </div>
  );
};