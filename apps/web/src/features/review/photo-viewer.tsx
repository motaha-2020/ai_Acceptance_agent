'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import type { BBoxDto } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export type BoxTone = 'critical' | 'major' | 'minor' | 'human' | 'removed';

export interface ViewerBox {
  id: string;
  bbox: BBoxDto;
  tone: BoxTone;
  label: string;
  selected?: boolean;
}

export interface PhotoViewerHandle {
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}

const TONE_COLOR: Record<BoxTone, string> = {
  critical: 'var(--chart-4)',
  major: 'var(--chart-2)',
  minor: 'var(--chart-1)',
  human: 'var(--chart-5)',
  removed: 'var(--muted-foreground)',
};

const MAX_ZOOM = 12;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

interface Props {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  boxes: ViewerBox[];
  showBoxes: boolean;
  onToggleBoxes: () => void;
  /** When set, the next drag on the image draws a normalised box and reports it. */
  drawing: boolean;
  onDraw: (bbox: BBoxDto) => void;
  onImageError?: () => void;
  className?: string;
}

/**
 * Zoomable/pannable photo with AI + human snag boxes overlaid. Boxes live inside the transformed
 * stage in normalised coordinates, so they stay glued to the image at any zoom.
 * Wheel = zoom at cursor, drag = pan, double-click = toggle 2.5x, +/-/0 via the imperative handle.
 */
export const PhotoViewer = forwardRef<PhotoViewerHandle, Props>(function PhotoViewer(
  { src, alt, width, height, boxes, showBoxes, onToggleBoxes, drawing, onDraw, onImageError, className },
  ref,
) {
  const t = useTranslations('review.viewer');
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [draft, setDraft] = useState<BBoxDto | null>(null);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);

  const iw = width ?? 4;
  const ih = height ?? 3;
  const base = Math.min(box.w / iw, box.h / ih);
  const sw = Math.max(1, iw * base);
  const sh = Math.max(1, ih * base);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = (): void => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // new photo => fit
  useEffect(() => {
    setView({ k: 1, x: 0, y: 0 });
    setDraft(null);
  }, [src]);

  const limit = useCallback(
    (k: number, x: number, y: number) => {
      const mx = Math.max(0, (sw * k - box.w) / 2);
      const my = Math.max(0, (sh * k - box.h) / 2);
      return { k, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
    },
    [sw, sh, box.w, box.h],
  );

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const k = clamp(v.k * factor, 1, MAX_ZOOM);
        const r = k / v.k;
        return limit(k, cx - (cx - v.x) * r, cy - (cy - v.y) * r);
      });
    },
    [limit],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomAt(1.4, 0, 0),
      zoomOut: () => zoomAt(1 / 1.4, 0, 0),
      reset: () => setView({ k: 1, x: 0, y: 0 }),
    }),
    [zoomAt],
  );

  // Non-passive wheel listener (React's onWheel is passive and cannot stop page scroll).
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const normalised = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = stage.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return { x: clamp((clientX - r.left) / r.width, 0, 1), y: clamp((clientY - r.top) / r.height, 0, 1) };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (drawing) {
      drawStart.current = normalised(e.clientX, e.clientY);
      setDraft({ ...drawStart.current, w: 0, h: 0 });
    } else {
      drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (drawing && drawStart.current) {
      const s = drawStart.current;
      const p = normalised(e.clientX, e.clientY);
      setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
    } else if (drag.current) {
      const d = drag.current;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView((v) => limit(v.k, d.vx + dx, d.vy + dy));
    }
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (drawing && drawStart.current) {
      const finished = draft;
      drawStart.current = null;
      setDraft(null);
      if (finished && finished.w > 0.01 && finished.h > 0.01) onDraw(finished);
    }
    drag.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (drawing) return;
    const r = frame.current?.getBoundingClientRect();
    if (!r) return;
    if (view.k > 1.05) setView({ k: 1, x: 0, y: 0 });
    else zoomAt(2.5, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
  };

  const zoomPct = Math.round(view.k * 100);

  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-black/90', className)}>
      <div
        ref={frame}
        data-testid="photo-frame"
        className={cn('relative size-full touch-none select-none', drawing ? 'cursor-crosshair' : view.k > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div
          ref={stage}
          dir="ltr"
          className="absolute"
          style={{
            width: sw,
            height: sh,
            left: (box.w - sw) / 2,
            top: (box.h - sh) / 2,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            transformOrigin: 'center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} draggable={false} onError={onImageError} className="size-full select-none object-fill" />
          {showBoxes || draft ? (
            <>
              <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
                {showBoxes
                  ? boxes.map((b) => (
                      <rect
                        key={b.id}
                        x={b.bbox.x}
                        y={b.bbox.y}
                        width={b.bbox.w}
                        height={b.bbox.h}
                        fill={b.selected ? TONE_COLOR[b.tone] : 'none'}
                        fillOpacity={0.18}
                        stroke={TONE_COLOR[b.tone]}
                        strokeWidth={b.selected ? 4 : 2.5}
                        strokeDasharray={b.tone === 'removed' ? '6 4' : undefined}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))
                  : null}
                {draft ? (
                  <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill="white" fillOpacity={0.15} stroke="white" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                ) : null}
              </svg>
              {showBoxes
                ? boxes.map((b) => (
                    <span
                      key={b.id}
                      className="pointer-events-none absolute origin-bottom-left whitespace-nowrap rounded-sm px-1 text-[0.6875rem] font-semibold leading-4 text-black"
                      style={{
                        left: `${b.bbox.x * 100}%`,
                        top: `${b.bbox.y * 100}%`,
                        background: TONE_COLOR[b.tone],
                        transform: `translateY(-100%) scale(${1 / view.k})`,
                      }}
                    >
                      {b.label}
                    </span>
                  ))
                : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="absolute end-2 top-2 flex items-center gap-1 rounded-md bg-black/60 p-1 text-white backdrop-blur">
        <Hint label={`${showBoxes ? t('hideBoxes') : t('showBoxes')} (B)`}>
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/20 hover:text-white" onClick={onToggleBoxes} aria-pressed={showBoxes} aria-label={t('toggleBoxes')}>
            {showBoxes ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          </Button>
        </Hint>
        <Hint label={`${t('zoomOut')} (−)`}>
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/20 hover:text-white" onClick={() => zoomAt(1 / 1.4, 0, 0)} aria-label={t('zoomOut')}>
            <ZoomOut aria-hidden />
          </Button>
        </Hint>
        <span className="min-w-10 text-center text-xs tabular-nums" aria-live="off" data-testid="zoom-level">
          {zoomPct}%
        </span>
        <Hint label={`${t('zoomIn')} (+)`}>
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/20 hover:text-white" onClick={() => zoomAt(1.4, 0, 0)} aria-label={t('zoomIn')}>
            <ZoomIn aria-hidden />
          </Button>
        </Hint>
        <Hint label={`${t('fit')} (0)`}>
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/20 hover:text-white" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label={t('fit')}>
            <Maximize2 aria-hidden />
          </Button>
        </Hint>
      </div>

      {drawing ? (
        <div role="status" className="absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[90%] rounded-md bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground shadow-lg">
          {t('drawHint')}
        </div>
      ) : null}
    </div>
  );
});
