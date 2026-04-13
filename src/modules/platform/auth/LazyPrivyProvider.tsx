/**
 * LazyPrivyProvider — Pass-through wrapper.
 * Privy SDK removed; this shim keeps the import graph intact.
 */
import type { ReactNode } from "react";

export function LazyPrivyProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
