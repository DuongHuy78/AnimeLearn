import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface KanjiStrokeDiagramProps {
  svg?: string | null;
  kanji?: string;
  className?: string;
  showFallback?: boolean;
  animate?: boolean;
}

const sanitizeKanjiSvg = (value?: string | null) => {
  if (!value) return '';

  const trimmed = value.trim();
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) {
    return '';
  }

  return trimmed
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|audio|video|canvas|image)\b[\s\S]*?>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*("|')\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*javascript:[^\s>]+/gi, '');
};

export function KanjiStrokeDiagram({
  svg,
  kanji,
  className,
  showFallback = false,
  animate = true,
}: KanjiStrokeDiagramProps) {
  const sanitizedSvg = useMemo(() => sanitizeKanjiSvg(svg), [svg]);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    if (!animate || !sanitizedSvg || !svgContainerRef.current) return;

    const paths = Array.from(
      svgContainerRef.current.querySelectorAll('path'),
    ) as SVGPathElement[];

    let nextStrokeDelay = 0;

    const animations = paths.map((path) => {
      let length = 1;

      try {
        length = Math.max(path.getTotalLength(), 1);
      } catch {
        length = 1;
      }

      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;

      const duration = Math.min(Math.max(length * 16, 560), 1250);
      const delay = nextStrokeDelay;
      nextStrokeDelay += duration + 180;

      const animation = path.animate(
        [
          { strokeDashoffset: `${length}` },
          { strokeDashoffset: '0' },
        ],
        {
          delay,
          duration,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards',
        },
      );

      return animation;
    });

    return () => {
      animations.forEach((animation) => animation.cancel());
    };
  }, [animate, replayKey, sanitizedSvg]);

  if (!sanitizedSvg && !showFallback) return null;

  return (
    <div
      className={cn(
        'relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner',
        className,
      )}
    >
      {sanitizedSvg && animate && (
        <button
          type="button"
          onClick={() => setReplayKey((current) => current + 1)}
          className="
            absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center
            rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm
            backdrop-blur transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300
          "
          title="Replay nét vẽ"
          aria-label="Replay nét vẽ Kanji"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}

      {sanitizedSvg ? (
        <div
          ref={svgContainerRef}
          role="img"
          aria-label={kanji ? `Minh họa nét viết Kanji ${kanji}` : 'Minh họa nét viết Kanji'}
          className="
            h-full w-full p-3
            [&_svg]:h-full [&_svg]:w-full [&_svg]:overflow-visible
            [&_svg]:drop-shadow-sm
          "
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />
      ) : (
        <div className="px-4 text-center text-sm font-semibold text-slate-400">
          Chưa có dữ liệu nét viết.
        </div>
      )}
    </div>
  );
}
