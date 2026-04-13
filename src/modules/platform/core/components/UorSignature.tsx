/**
 * UorSignature — Subtle "Powered by UOR. With ❤️." branding signature.
 * Drop into any app footer or status bar.
 */

export function UorSignature({ className = "" }: { className?: string }) {
  return (
    <span className={`text-[11px] text-muted-foreground/25 font-mono select-none ${className}`}>
      Powered by UOR. With{" "}
      <span className="text-rose-400/40">❤️</span>.
    </span>
  );
}

export default UorSignature;
