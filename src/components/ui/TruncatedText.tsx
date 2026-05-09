import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  /** Text to render and tooltip on overflow. */
  text: string;
  /** Optional separate tooltip text (defaults to `text`). */
  tooltip?: string;
  /** Delay before the tooltip shows on hover. */
  delayMs?: number;
}

/**
 * A `<span>` that renders truncated text and pops a themed tooltip — but only
 * when the underlying element is actually clipped (scrollWidth > clientWidth).
 * If everything fits, no tooltip; the user isn't bothered for short labels.
 */
export function TruncatedText({
  text,
  tooltip,
  delayMs = 180,
  className,
  ...rest
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const open = () => {
    const el = triggerRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 1) return; // nothing clipped
    const rect = el.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
  };

  const handleEnter = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(open, delayMs);
  };

  const handleLeave = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPos(null);
  };

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("truncate", className)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        {...rest}
      >
        {text}
      </span>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.y,
              left: pos.x,
              transform: "translate(-50%, 0)",
              pointerEvents: "none",
              zIndex: 1000,
            }}
            className="max-w-xs break-all rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg"
          >
            {tooltip ?? text}
          </div>,
          document.body,
        )}
    </>
  );
}
