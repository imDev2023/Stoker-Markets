"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import type { WalletError } from "@solana/wallet-adapter-base";
import type { ReactNode } from "react";
import { RegionProvider } from "./RegionGate";

/** Declining in the wallet is the user's choice, not an error; the component that asked shows what happened. */
function onWalletError(error: WalletError) {
  if (!/reject|declin|cancel/i.test(error.message)) console.error(error);
}

/** Wallets are discovered through the Wallet Standard, so no wallet-specific adapters are bundled. */
export function Providers({ rpcUrl, children }: { rpcUrl: string; children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={rpcUrl} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={[]} autoConnect onError={onWalletError}>
        <RegionProvider>{children}</RegionProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
