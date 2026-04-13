/**
 * CSSPresence — Zero-dependency replacement for framer-motion's AnimatePresence.
 *
 * Delays unmounting until a CSS exit animation completes, using onAnimationEnd.
 * Pairs with transitions.css classes: sov-fade-in/out, sov-scale-in/out, sov-slide-*.
 *
 * ~20 lines. Zero JS per animation frame.
 */

import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";

interface Props {
  show: boolean;
  enterClass?: string;
  exitClass?: string;
  children: ReactNode;
  /** Extra className on wrapper div */
  className?: string;
  style?: CSSProperties;
  /** If true, renders children directly without a wrapping div */
  bare?: boolean;
  as?: keyof JSX.IntrinsicElements;
  onClick?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export default function CSSPresence({
  show,
  enterClass = "sov-fade-in",
  exitClass = "sov-fade-out",
  children,
  className = "",
  style,
  as: Tag = "div",
  onClick,
  onMouseLeave,
  onPointerDown,
}: Props) {
  const [render, setRender] = useState(show);
  const [animClass, setAnimClass] = useState(show ? enterClass : "");
  const prevShow = useRef(show);

  useEffect(() => {
    if (show && !prevShow.current) {
      setRender(true);
      setAnimClass(enterClass);
    } else if (!show && prevShow.current) {
      setAnimClass(exitClass);
    }
    prevShow.current = show;
  }, [show, enterClass, exitClass]);

  const handleAnimEnd = () => {
    if (!show) setRender(false);
  };

  if (!render) return null;

  return (
    // @ts-ignore — dynamic tag
    <Tag
      className={`${animClass} ${className}`.trim()}
      style={style}
      onAnimationEnd={handleAnimEnd}
      onClick={onClick}
      onMouseLeave={onMouseLeave}
      onPointerDown={onPointerDown}
    >
      {children}
    </Tag>
  );
}
