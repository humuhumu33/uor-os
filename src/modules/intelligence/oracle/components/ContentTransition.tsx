/**
 * ContentTransition — Wraps content with a smooth crossfade
 * when transitioning from seed (Wikipedia extract) to AI-streamed content.
 */

import React, { useState, useEffect, useRef } from "react";

interface Props {
  contentKey: string;
  children: React.ReactNode;
}

const ContentTransition: React.FC<Props> = ({ contentKey, children }) => {
  const [currentKey, setCurrentKey] = useState(contentKey);
  const [animClass, setAnimClass] = useState("sov-fade-in");

  const prevKey = useRef(contentKey);

  useEffect(() => {
    if (contentKey !== prevKey.current) {
      setAnimClass("sov-fade-out");
      const t = setTimeout(() => {
        setCurrentKey(contentKey);
        setAnimClass("sov-fade-in");
      }, 120);
      prevKey.current = contentKey;
      return () => clearTimeout(t);
    }
  }, [contentKey]);

  return (
    <div key={currentKey} className={animClass}>
      {children}
    </div>
  );
};

export default ContentTransition;
