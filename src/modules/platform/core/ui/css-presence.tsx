/**
 * CSSPresence — Zero-dependency AnimatePresence replacement.
 * ══════════════════════════════════════════════════════════
 *
 * Mounts children when `show` is true. On exit, applies `exitClass`
 * and waits for `animationend` before unmounting. ~20 lines, no JS frames.
 *
 * @module platform/core/ui/css-presence
 */

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";

interface CSSPresenceProps {
  show: boolean;
  enterClass?: string;
  exitClass?: string;
  children: ReactNode;
  /** If true, wraps children in a div to attach animation classes */
  wrap?: boolean;
  /** Optional wrapper className (in addition to enter/exit classes) */
  className?: string;
  /** Duration fallback in ms if animationend doesn't fire */
  timeout?: number;
}

export function CSSPresence({
  show,
  enterClass = "animate-fade-in",
  exitClass = "animate-fade-out",
  children,
  wrap = true,
  className = "",
  timeout = 400,
}: CSSPresenceProps) {
  const [mounted, setMounted] = useState(show);
  const [exiting, setExiting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (show) {
      setMounted(true);
      setExiting(false);
    } else if (mounted) {
      setExiting(true);
      // Fallback unmount if animationend doesn't fire
      timerRef.current = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, timeout);
    }
    return () => clearTimeout(timerRef.current);
  }, [show, mounted, timeout]);

  const handleAnimationEnd = useCallback(() => {
    if (exiting) {
      clearTimeout(timerRef.current);
      setMounted(false);
      setExiting(false);
    }
  }, [exiting]);

  if (!mounted) return null;

  const animClass = exiting ? exitClass : enterClass;

  if (!wrap) {
    return <>{children}</>;
  }

  return (
    <div
      ref={ref}
      className={`${animClass} ${className}`.trim()}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
}

export default CSSPresence;
