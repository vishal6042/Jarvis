import { useLayoutEffect, useRef, useState } from "react";

/**
 * Width of an element in CSS pixels, kept current as the layout changes. Charts draw at this
 * width rather than scaling a fixed viewBox, so dots stay round and text keeps its shape.
 * Measured once before the first paint (so a chart never flashes at the fallback size), then
 * followed with a ResizeObserver.
 */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (w: number) => setWidth(Math.max(200, Math.round(w)));
    if (el.clientWidth > 0) measure(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
