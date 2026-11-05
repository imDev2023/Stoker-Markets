"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import type { WalletError } from "@solana/wallet-adapter-base";
import type { ReactNode } from "react";
import { RegionProvider } from "./RegionGate";
import { SignInProvider } from "./SignIn";

/** Declining in the wallet is the user's choice, not an error; the component that asked shows what happened. */
function onWalletError(error: WalletError) {
  if (!/reject|declin|cancel/i.test(error.message)) console.error(error);
}

/**
 * Wallets are discovered through the Wallet Standard, so no wallet-specific adapters are bundled; the sign-in provider's
 * embedded wallet arrives the same way (ADR 0016), from the `SignInProvider` under the wallet provider.
 */
export function Providers({ rpcUrl, cluster, children }: { rpcUrl: string; cluster: string; children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={rpcUrl} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={[]} autoConnect onError={onWalletError}>
        <SignInProvider rpcUrl={rpcUrl} cluster={cluster}>
          <RegionProvider>{children}</RegionProvider>
        </SignInProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
