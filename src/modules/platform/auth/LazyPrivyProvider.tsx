/**
 * LazyPrivyProvider — Lightweight shim that renders children immediately
 * and loads the heavy Privy SDK only when wallet features are accessed.
 *
 * This keeps ~200KB+ of Privy off the critical boot path.
 */

import { lazy, Suspense, type ReactNode } from "react";

const PrivyWalletProvider = lazy(() =>
  import("./PrivyWalletProvider").then((m) => ({ default: m.PrivyWalletProvider })),
);

export function LazyPrivyProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <PrivyWalletProvider>{children}</PrivyWalletProvider>
    </Suspense>
  );
}
