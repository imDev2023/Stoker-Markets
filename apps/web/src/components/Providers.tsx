"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";

/** Wallets are discovered through the Wallet Standard, so no wallet-specific adapters are bundled. */
export function Providers({ rpcUrl, children }: { rpcUrl: string; children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={rpcUrl} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={[]} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
