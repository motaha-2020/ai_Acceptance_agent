'use client';

import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Global single-key shortcuts keyed by `KeyboardEvent.code` (physical key), so they keep working
 * when the keyboard layout is Arabic. Use "Shift+Slash" for "?". Ignored while typing in a field,
 * with Ctrl/Meta/Alt held, or when `enabled` is false (e.g. a dialog is open).
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (isEditable(e.target)) return;
      // "?" / Arabic "؟" is Shift+Slash on both layouts; accept either way it is reported.
      const question = e.key === '?' || e.key === '؟';
      const id = question ? 'Shift+Slash' : e.shiftKey ? `Shift+${e.code}` : e.code;
      const handler = ref.current[id];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
