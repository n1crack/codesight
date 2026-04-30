import { useRef, useState } from "react";

export function useChartTooltip<T>() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<T | null>(null);

  const updatePos = (clientX: number, clientY: number) => {
    const tip = tooltipRef.current;
    const ctn = containerRef.current;
    if (!tip || !ctn) return;
    const rect = ctn.getBoundingClientRect();
    const x = clientX - rect.left + 12;
    const y = clientY - rect.top + 12;
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
