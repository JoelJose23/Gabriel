import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
  SyntheticEvent,
  TransitionEvent as ReactTransitionEvent,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * FloatingPanel — the single shared primitive for every dropdown / popover /
 * floating menu in the app.
 *
 * It owns, in exactly one place:
 *  - open/close state + toggle
 *  - positioning (anchor rect -> fixed coords, flip above/below, viewport clamp)
 *  - open AND close transitions (identical motion everywhere, exit included)
 *  - the ONLY outside-click implementation (capture mousedown + touchstart)
 *  - the ONLY Escape-to-close implementation
 *  - portal rendering into document.body
 *  - an exclusivity registry so opening one panel closes all others
 *
 * Individual components (Select, AttachMenuPopover, notification popups, ...)
 * must NOT implement their own document.addEventListener outside-click logic
 * or their own open/close animations. They consume this hook and render
 * <FloatingPanel>.
 */

export interface UsePopoverOptions {
  /** Gap in px between trigger and panel. Default 6. */
  offset?: number;
  /** Horizontal alignment of the panel relative to the trigger. Default 'left'. */
  align?: 'left' | 'right';
  /** Size the panel to at least the trigger's width. Default false. */
  matchTriggerWidth?: boolean;
  /** Minimum panel width in px. */
  minWidth?: number;
  /** Maximum panel height in px (panel scrolls beyond this). Default 240. */
  maxHeight?: number;
  /** Opening this panel closes all other usePopover panels. Default true. */
  exclusive?: boolean;
}

export interface PopoverCloseOptions {
  refocusTrigger?: boolean;
}

/** Enter/exit durations shared by every panel. Ease-out opens, ease-in closes. */
export const POPOVER_ENTER_MS = 160;
export const POPOVER_EXIT_MS = 150;

/** Stop an event at BOTH layers: React synthetic bubbling (which follows the
 *  React tree, so portal children still bubble to logical ancestors) and the
 *  native event (so document-level listeners never see it either). */
export function stopEvent(e: SyntheticEvent): void {
  e.stopPropagation();
  const native = e.nativeEvent as Event | undefined;
  if (native && typeof native.stopImmediatePropagation === 'function') {
    native.stopImmediatePropagation();
  }
}

type CloseFn = (options?: PopoverCloseOptions) => void;

/** Module-level registry of currently-open panels. One registry for the whole
 *  app is what guarantees "opening A closes B" without any cross-component
 *  wiring. A panel is removed the moment it *starts* closing, so a closing
 *  panel never blocks a newly opening one. */
const openPopovers = new Set<CloseFn>();

export interface UsePopoverApi {
  /** Logical open state. Drives aria-expanded, chevrons, listeners. */
  isOpen: boolean;
  /** True while the panel is in the DOM (open OR exit-animating). */
  rendered: boolean;
  open: (e?: SyntheticEvent) => void;
  close: (options?: PopoverCloseOptions) => void;
  toggle: (e?: SyntheticEvent) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  panelStyle: CSSProperties;
  handlePanelTransitionEnd: (e: ReactTransitionEvent<HTMLDivElement>) => void;
  triggerProps: {
    ref: RefObject<HTMLButtonElement | null>;
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
    onMouseDown: (e: ReactMouseEvent<HTMLButtonElement>) => void;
    'aria-expanded': boolean;
  };
  panelProps: {
    ref: RefObject<HTMLDivElement | null>;
    style: CSSProperties;
    onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
    onTransitionEnd: (e: ReactTransitionEvent<HTMLDivElement>) => void;
  };
}

export function usePopover(options: UsePopoverOptions = {}): UsePopoverApi {
  const {
    offset = 6,
    align = 'left',
    matchTriggerWidth = false,
    minWidth,
    maxHeight = 240,
    exclusive = true,
  } = options;

  const [isOpen, setIsOpen] = useState(false);
  // `rendered` keeps the panel mounted through its exit transition;
  // `entered` drives the open/closed style. Together they form the
  // closed -> entering -> open -> exiting -> closed machine.
  const [rendered, setRendered] = useState(false);
  const [entered, setEntered] = useState(false);
  const enteredRef = useRef(false);
  const unmountTimer = useRef<number | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 99999,
    visibility: 'hidden',
  });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Guards the opening interaction: the listener only exists while open, but
  // this also absorbs programmatic opens and StrictMode effect re-runs.
  const justOpenedRef = useRef(false);

  const clearUnmountTimer = () => {
    if (unmountTimer.current !== null) {
      window.clearTimeout(unmountTimer.current);
      unmountTimer.current = null;
    }
  };

  const setEnteredState = (value: boolean) => {
    enteredRef.current = value;
    setEntered(value);
  };

  const close = useCallback((opts?: PopoverCloseOptions) => {
    // Leave the exclusivity set immediately: logically closed from here on,
    // even though the exit animation keeps it mounted briefly.
    openPopovers.delete(close);
    setIsOpen(false);
    setEnteredState(false);
    // Fallback unmount in case onTransitionEnd never fires (tab hidden,
    // transitions disabled). The transitionend handler clears this first.
    clearUnmountTimer();
    unmountTimer.current = window.setTimeout(() => {
      unmountTimer.current = null;
      if (!enteredRef.current) setRendered(false);
    }, POPOVER_EXIT_MS + 80);
    if (opts?.refocusTrigger) triggerRef.current?.focus();
  }, []);

  const open = useCallback(
    (e?: SyntheticEvent) => {
      if (e) stopEvent(e);
      if (exclusive) {
        openPopovers.forEach((fn) => {
          if (fn !== close) fn();
        });
      }
      justOpenedRef.current = true;
      window.setTimeout(() => {
        justOpenedRef.current = false;
      }, 0);
      openPopovers.add(close);
      // Re-opening mid-exit: cancel the pending unmount, keep the DOM node,
      // transition back to the open style — a smooth reversal, no flicker.
      clearUnmountTimer();
      setIsOpen(true);
      setRendered(true);
      // Enter on a later frame so the browser paints the closed style first;
      // otherwise the open transition is skipped and the panel snaps in.
      // Guarded by registry membership so a close() in between wins.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (openPopovers.has(close)) setEnteredState(true);
        });
      });
    },
    [close, exclusive],
  );

  const toggle = useCallback(
    (e?: SyntheticEvent) => {
      if (e) stopEvent(e);
      if (isOpen) close();
      else open();
    },
    [isOpen, open, close],
  );

  const handlePanelTransitionEnd = useCallback((e: ReactTransitionEvent<HTMLDivElement>) => {
    // Ignore transitions bubbling up from children (option hovers, etc.).
    if (e.target !== e.currentTarget) return;
    if (!enteredRef.current) {
      clearUnmountTimer();
      setRendered(false);
    }
  }, []);

  // Unregister + drop timers on unmount so a dead panel can never linger.
  useEffect(() => {
    return () => {
      openPopovers.delete(close);
      if (unmountTimer.current !== null) {
        window.clearTimeout(unmountTimer.current);
        unmountTimer.current = null;
      }
    };
  }, [close]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const panel = panelRef.current;
    const measuredH = panel?.offsetHeight || (maxHeight ?? 300);
    const measuredW = panel?.offsetWidth || 0;
    const baseWidth = matchTriggerWidth ? Math.max(rect.width, minWidth ?? 0) : Math.max(measuredW, minWidth ?? 0);
    const width = baseWidth > 0 ? baseWidth : rect.width;
    const height = maxHeight ? Math.min(measuredH, maxHeight) : measuredH;

    const spaceBelow = vh - rect.bottom - offset - 8;
    const spaceAbove = rect.top - offset - 8;
    const placeAbove = spaceBelow < height && spaceAbove > spaceBelow;

    const top = placeAbove ? Math.max(8, rect.top - height - offset) : rect.bottom + offset;
    const rawLeft = align === 'right' ? rect.right - width : rect.left;
    const left = Math.max(8, Math.min(rawLeft, vw - width - 8));

    setPanelStyle({
      position: 'fixed',
      top,
      left,
      width: Math.max(0, width),
      maxWidth: vw - 16,
      height: 'max-content',
      overflow: 'hidden',
      zIndex: 99999,
      visibility: 'visible',
      transformOrigin: `${placeAbove ? 'bottom' : 'top'} ${align === 'right' ? 'right' : 'left'}`,
    });
  }, [offset, align, matchTriggerWidth, minWidth, maxHeight]);

  // Positioning runs in layout effect (before paint), so the panel never
  // flashes at a wrong spot. Re-runs on scroll/resize while open.
  // Note: keyed on `rendered`, not `isOpen`, so a re-open mid-exit still
  // repositions correctly.
  useLayoutEffect(() => {
    if (!rendered) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [rendered, updatePosition]);

  // THE single outside-click + Escape implementation for the whole app.
  // Capture phase so it runs before any ancestor ("capsule") handler, with
  // trigger/panel containment exemptions so open/select clicks never misfire.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: Event) => {
      if (justOpenedRef.current) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close({ refocusTrigger: true });
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, close]);

  // Motion is owned here so every panel animates identically. While exiting,
  // pointer events are disabled so the fading panel never swallows clicks.
  const motionStyle: CSSProperties = {
    opacity: entered ? 1 : 0,
    transform: entered ? 'scale(1)' : 'scale(0.96)',
    transition: entered
      ? `opacity ${POPOVER_ENTER_MS}ms ease-out, transform ${POPOVER_ENTER_MS}ms ease-out`
      : `opacity ${POPOVER_EXIT_MS}ms ease-in, transform ${POPOVER_EXIT_MS}ms ease-in`,
    pointerEvents: entered ? undefined : 'none',
  };

  return {
    isOpen,
    rendered,
    open,
    close,
    toggle,
    triggerRef,
    panelRef,
    panelStyle,
    handlePanelTransitionEnd,
    triggerProps: {
      ref: triggerRef,
      onClick: toggle,
      onMouseDown: stopEvent,
      'aria-expanded': isOpen,
    },
    panelProps: {
      ref: panelRef,
      style: { ...panelStyle, ...motionStyle },
      onMouseDown: stopEvent,
      onTransitionEnd: handlePanelTransitionEnd,
    },
  };
}

export interface FloatingPanelProps {
  api: UsePopoverApi;
  className?: string;
  style?: CSSProperties;
  role?: string;
  children: ReactNode;
}

/** Portals the panel into document.body. Stays mounted through the exit
 *  transition (`rendered`), unmounts only after it finishes. */
export function FloatingPanel({ api, className = '', style, role = 'dialog', children }: FloatingPanelProps) {
  if (!api.rendered) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div {...api.panelProps} role={role} className={`aurora-glass ${className}`} style={{ ...api.panelProps.style, ...style }}>
      {children}
    </div>,
    document.body,
  );
}
