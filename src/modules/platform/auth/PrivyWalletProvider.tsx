/**
 * PrivyWalletProvider — Stub provider (Privy SDK removed).
 * Provides a no-op wallet context so existing imports keep working.
 */

import { createContext, useContext, type ReactNode } from "react";

interface WalletContextValue {
  walletAddress: string | null;
  ready: boolean;
  wallet: null;
}

const WalletContext = createContext<WalletContextValue>({
  walletAddress: null,
  ready: false,
  wallet: null,
});

export function PrivyWalletProvider({ children }: { children: ReactNode }) {
  return (
    <WalletContext.Provider value={{ walletAddress: null, ready: false, wallet: null }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  return useContext(WalletContext);
}
