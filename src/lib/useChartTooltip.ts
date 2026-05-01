import { useRef, useState } from "react";

const OFFSET = 12;
const EDGE_PAD = 8;
// rough fallback width before first measurement; updated after first paint
const DEFAULT_W = 220;
const DEFAULT_H = 36;

export function useChartTooltip<T>() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<T | null>(null);

  const updatePos = (clientX: number, clientY: number) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = tip.getBoundingClientRect();
    const tipW = r.width || DEFAULT_W;
    const tipH = r.height || DEFAULT_H;

    let x = clientX + OFFSET;
    let y = clientY + OFFSET;
    if (x + tipW > w - EDGE_PAD) x = clientX - tipW - OFFSET;
    if (y + tipH > h - EDGE_PAD) y = clientY - tipH - OFFSET;
    if (x < EDGE_PAD) x = EDGE_PAD;
    if (y < EDGE_PAD) y = EDGE_PAD;

    tip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!active) return;
    updatePos(e.clientX, e.clientY);
  };

  const onMouseLeave = () => setActive(null);

  const enter = (value: T, e: React.MouseEvent) => {
    setActive(value);
    updatePos(e.clientX, e.clientY);
  };

  return {
    containerRef,
    tooltipRef,
    active,
    setActive,
    enter,
    onMouseMove,
    onMouseLeave,
  };
}
