/**
 * CSSPresence — Zero-dependency replacement for framer-motion's AnimatePresence.
 *
 * Delays unmounting until a CSS exit animation completes, using onAnimationEnd.
 * Pairs with transitions.css classes: sov-fade-in/out, sov-scale-in/out, sov-slide-*.
 */

import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";

interface Props {
  show: boolean;
  enterClass?: string;
  exitClass?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
}

export default function CSSPresence({
  show,
  enterClass = "sov-fade-in",
  exitClass = "sov-fade-out",
  children,
  className = "",
  style,
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
    <div
      className={`${animClass} ${className}`.trim()}
      style={style}
      onAnimationEnd={handleAnimEnd}
      onClick={onClick}
      onMouseLeave={onMouseLeave}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}
