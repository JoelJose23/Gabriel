import type { FC } from 'react';
import { Paperclip, Upload, Image as ImageIcon, FileCode } from 'lucide-react';
import { usePopover, FloatingPanel, stopEvent } from './FloatingPanel';

interface AttachMenuPopoverProps {
  onSelect?: (option: 'file' | 'image' | 'prompt') => void;
  className?: string;
  buttonClassName?: string;
  iconSize?: number;
}

export const AttachMenuPopover: FC<AttachMenuPopoverProps> = ({
  onSelect,
  className = '',
  buttonClassName = '',
  iconSize = 16,
}) => {
  // All open/close, positioning, outside-click and Escape behavior comes from
  // the shared primitive. This component owns only: the trigger button,
  // the three menu items and visuals.
  const popover = usePopover({ minWidth: 190, maxHeight: 300 });

  const handleOptionClick = (type: 'file' | 'image' | 'prompt', e: React.MouseEvent) => {
    stopEvent(e);
    popover.close({ refocusTrigger: true });
    onSelect?.(type);
  };

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        {...popover.triggerProps}
        className={
          buttonClassName ||
          `p-1.5 rounded-full overflow-hidden transition-all cursor-pointer ${
            popover.isOpen
              ? 'text-[var(--color-accent)] bg-[var(--color-accent-bg)] ring-2 ring-[var(--color-accent)]/20'
              : 'text-text-secondary hover:text-[var(--color-accent)] hover:bg-[#2f2f2f] dark:hover:bg-[#2f2f2f]'
          }`
        }
        aria-label="Attach file or media"
        title="Attach file, image, or prompt"
      >
        <Paperclip size={iconSize} strokeWidth={1.5} />
      </button>

      <FloatingPanel
        api={popover}
        role="menu"
        className="glass-dropdown aurora-glass p-1.5 shadow-2xl space-y-0.5 text-xs"
      >
        <button
          type="button"
          onClick={(e) => handleOptionClick('file', e)}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left font-medium text-text-primary hover:bg-[rgba(255,255,255,0.10)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors cursor-pointer"
          role="menuitem"
        >
          <Upload size={14} className="text-primary shrink-0" />
          <span>Upload File</span>
        </button>
        <button
          type="button"
          onClick={(e) => handleOptionClick('image', e)}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left font-medium text-text-primary hover:bg-[rgba(255,255,255,0.10)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors cursor-pointer"
          role="menuitem"
        >
          <ImageIcon size={14} className="text-secondary shrink-0" />
          <span>Upload Image</span>
        </button>
        <button
          type="button"
          onClick={(e) => handleOptionClick('prompt', e)}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left font-medium text-text-primary hover:bg-[rgba(255,255,255,0.10)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors cursor-pointer"
          role="menuitem"
        >
          <FileCode size={14} className="text-text-secondary shrink-0" />
          <span>Import Prompt</span>
        </button>
      </FloatingPanel>
    </div>
  );
};
