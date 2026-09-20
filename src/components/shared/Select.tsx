import type { FC } from 'react';
import { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { usePopover, FloatingPanel, stopEvent } from './FloatingPanel';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: (SelectOption | string)[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  icon?: React.ReactNode;
  align?: 'left' | 'right';
  disabled?: boolean;
}

export const Select: FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  className = '',
  icon,
  align = 'left',
  disabled = false,
}) => {
  // All open/close, positioning, outside-click and Escape behavior comes from
  // the shared primitive. This component owns only: options, selection,
  // highlight state and visuals.
  const popover = usePopover({ align, matchTriggerWidth: true, minWidth: 200 });
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const formattedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const selectedOption = formattedOptions.find((opt) => opt.value === value);
  const isDisabled = disabled || formattedOptions.length === 0;

  useEffect(() => {
    const idx = formattedOptions.findIndex((opt) => opt.value === value);
    setHighlightedIndex(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length]);

  const handleSelect = (val: string, e?: React.MouseEvent) => {
    if (e) stopEvent(e);
    if (isDisabled) return;
    onChange(val);
    popover.close();
  };

  return (
    <div className={`relative w-full text-left ${className}`}>
      <button
        type="button"
        disabled={isDisabled}
        {...popover.triggerProps}
        onClick={(e) => {
          if (!isDisabled) popover.toggle(e);
        }}
        onKeyDown={(event) => {
          if (isDisabled) return;
          if (event.key === 'Escape') {
            popover.close();
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!popover.isOpen) popover.open();
            else setHighlightedIndex((prev) => (prev + 1) % formattedOptions.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!popover.isOpen) popover.open();
            else setHighlightedIndex((prev) => (prev - 1 + formattedOptions.length) % formattedOptions.length);
          } else if ((event.key === 'Enter' || event.key === ' ') && popover.isOpen && highlightedIndex >= 0) {
            event.preventDefault();
            handleSelect(formattedOptions[highlightedIndex].value);
          }
        }}
        className={`w-full flex items-center justify-between gap-2 glass-pill aurora-glass px-3 py-2 text-xs font-semibold text-text-primary hover:border-[rgba(255,255,255,0.28)] focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all ${
          isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
        aria-haspopup="listbox"
        aria-disabled={isDisabled}
      >
        <div className="flex items-center gap-2 truncate">
          {icon}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-500 shrink-0 transition-transform duration-200 ${popover.isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <FloatingPanel
        api={popover}
        role="listbox"
        className="glass-dropdown aurora-glass p-1.5 space-y-0.5 h-max overflow-hidden"
      >
        {formattedOptions.map((opt, index) => {
          const isSelected = opt.value === value;
          const isHighlighted = index === highlightedIndex;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => handleSelect(opt.value, e)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors text-left cursor-pointer ${
                isSelected
                  ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-bold'
                  : isHighlighted
                  ? 'bg-[rgba(255,255,255,0.10)] dark:bg-[rgba(255,255,255,0.08)] text-text-primary'
                  : 'text-text-primary hover:bg-[rgba(255,255,255,0.10)] dark:hover:bg-[rgba(255,255,255,0.08)]'
              }`}
              role="option"
              aria-selected={isSelected}
            >
              <span className="truncate">{opt.label}</span>
              {isSelected && <Check size={14} className="text-primary shrink-0 ml-2" />}
            </button>
          );
        })}
      </FloatingPanel>
    </div>
  );
};
