"use client";

import type { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { EMBEDDED_WALLET_NAME, SIGN_IN_STAND_IN, WEB3AUTH_CLIENT_ID, type SignInAccount, type SocialProvider } from "@/lib/signIn";

/**
 * What the sign-in provider gives the app (ADR 0016). `enabled` says whether social and email sign-in are offered at
 * all; the rest is the session. The functions reject with a message for the sheet to show.
 */
export type SignInState = {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  account: SignInAccount | null;
  /** The embedded wallet's address once it exists and is registered with the Wallet Standard. */
  embeddedAddress: string | null;
  loginWith: (provider: SocialProvider) => Promise<void>;
  /** Signs in with an email: the provider sends the code and takes it on its own page, then the promise settles. */
  loginWithEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  /** The embedded wallet's secret key, base58 as Phantom and Solflare import it, for the site's own export dialog. */
  exportWallet: (() => Promise<string>) | null;
};

const never = async () => {
  throw new Error("Sign in is not available here.");
};

const DISABLED: SignInState = {
  enabled: false,
  ready: true,
  authenticated: false,
  account: null,
  embeddedAddress: null,
  loginWith: never,
  loginWithEmail: never,
  logout: async () => undefined,
  exportWallet: null,
};

const SignInContext = createContext<SignInState>(DISABLED);

export function useSignIn() {
  return useContext(SignInContext);
}

/** The bridge's contract: a leaf that publishes the provider's state up, so the provider's tree never wraps the app. */
export type BridgeProps = { onState: (state: SignInState) => void; rpcUrl: string; cluster: string };

/** The Web3Auth bridge is client-only and loaded only when a client id is set, so no page pays for it without one. */
const Web3AuthBridge = dynamic(() => import("./Web3AuthSignIn").then((m) => m.Web3AuthSignIn), { ssr: false });

/** The suite's stand-in, if one was installed before the app loaded (tests/ui/src/wallet.ts). */
type StandIn = Omit<SignInState, "enabled"> & { subscribe: (listener: () => void) => () => void };

function standIn(): StandIn | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as Record<string, StandIn | undefined>)[SIGN_IN_STAND_IN] ?? null;
}

function StandInBridge({ onState }: BridgeProps) {
  useEffect(() => {
    const s = standIn();
    if (!s) return;
    const publish = () =>
      onState({
        enabled: true,
        ready: s.ready,
        authenticated: s.authenticated,
        account: s.account,
        embeddedAddress: s.embeddedAddress,
        loginWith: s.loginWith,
        loginWithEmail: s.loginWithEmail,
        logout: s.logout,
        exportWallet: s.exportWallet,
      });
    publish();
    return s.subscribe(publish);
  }, [onState]);
  return null;
}

/**
 * Selects the embedded wallet once the provider has registered it and nothing else is connected: after a sign-in
 * (which may come back from the provider's redirect with nothing remembered) and on every later visit while the
 * session holds. A wallet the user chose themselves is never replaced, and signing out ends the session, so nothing
 * reconnects after it.
 */
function EmbeddedWalletConnector() {
  const { authenticated, embeddedAddress } = useSignIn();
  const { wallets, wallet, publicKey, connecting, select, connect } = useWallet();
  const registered = wallets.some((w) => w.adapter.name === EMBEDDED_WALLET_NAME);
  useEffect(() => {
    if (!authenticated || !embeddedAddress || !registered || connecting) return;
    if (!wallet) select(EMBEDDED_WALLET_NAME as WalletName);
    else if (wallet.adapter.name === EMBEDDED_WALLET_NAME && !publicKey) connect().catch(() => undefined);
  }, [authenticated, embeddedAddress, registered, connecting, wallet, publicKey, select, connect]);
  return null;
}

/**
 * Holds the sign-in state for the app. The bridge in use is decided once on the client: the suite's stand-in when one
 * is installed, else Web3Auth when a client id was set at build, else nothing (the sheet offers wallets alone).
 */
export function SignInProvider({ rpcUrl, cluster, children }: { rpcUrl: string; cluster: string; children: ReactNode }) {
  const [state, setState] = useState<SignInState>(() => (WEB3AUTH_CLIENT_ID ? { ...DISABLED, enabled: true, ready: false } : DISABLED));
  const [bridge, setBridge] = useState<"none" | "standIn" | "web3auth">(WEB3AUTH_CLIENT_ID ? "web3auth" : "none");
  useEffect(() => {
    if (standIn()) setBridge("standIn");
  }, []);
  return (
    <SignInContext.Provider value={state}>
      {children}
      {bridge === "standIn" ? <StandInBridge onState={setState} rpcUrl={rpcUrl} cluster={cluster} /> : bridge === "web3auth" ? <Web3AuthBridge onState={setState} rpcUrl={rpcUrl} cluster={cluster} /> : null}
      <EmbeddedWalletConnector />
    </SignInContext.Provider>
  );
}
