"use client";

import { AUTH_CONNECTION, CHAIN_NAMESPACES, WALLET_CONNECTORS, WEB3AUTH_NETWORK } from "@web3auth/modal";
import { Web3AuthProvider, useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser, type Web3AuthContextConfig } from "@web3auth/modal/react";
import { registerWallet } from "@wallet-standard/wallet";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BridgeProps } from "./SignIn";
import { fromHex, toBase58 } from "@/lib/base58";
import { EMBEDDED_WALLET_ICON, EMBEDDED_WALLET_NAME, WEB3AUTH_CLIENT_ID, WEB3AUTH_NETWORK_NAME, type SignInAccount, type SocialProvider } from "@/lib/signIn";

type StandardWallet = Parameters<typeof registerWallet>[0];

/**
 * Web3Auth's Solana wallet, given to the app under the site's own name and icon through the Wallet Standard, so the
 * wallet adapter lists and signs with it like any wallet (ADR 0016). Getters delegate, since the wallet's accounts
 * change as it connects.
 */
function branded(wallet: StandardWallet): StandardWallet {
  return {
    get version() {
      return wallet.version;
    },
    get name() {
      return EMBEDDED_WALLET_NAME;
    },
    get icon() {
      return EMBEDDED_WALLET_ICON as StandardWallet["icon"];
    },
    get chains() {
      return wallet.chains;
    },
    get features() {
      return wallet.features;
    },
    get accounts() {
      return wallet.accounts;
    },
  };
}

const CONNECTIONS: Record<SocialProvider, (typeof AUTH_CONNECTION)[keyof typeof AUTH_CONNECTION]> = {
  google: AUTH_CONNECTION.GOOGLE,
  apple: AUTH_CONNECTION.APPLE,
  github: AUTH_CONNECTION.GITHUB,
  twitter: AUTH_CONNECTION.TWITTER,
};

/** The sign-in the user made, in the order a person would name themselves by. */
function accountOf(info: { authConnection?: string; name?: string; email?: string; profileImage?: string } | null): SignInAccount | null {
  if (!info?.authConnection) return null;
  const picture = info.profileImage ?? null;
  switch (info.authConnection) {
    case AUTH_CONNECTION.GOOGLE:
      return { provider: "google", label: info.name ?? info.email ?? "Google", picture };
    case AUTH_CONNECTION.APPLE:
      return { provider: "apple", label: info.email ?? info.name ?? "Apple", picture };
    case AUTH_CONNECTION.GITHUB:
      return { provider: "github", label: info.name ?? info.email ?? "GitHub", picture };
    case AUTH_CONNECTION.TWITTER:
      return { provider: "twitter", label: info.name ?? "X", picture };
    case AUTH_CONNECTION.EMAIL_PASSWORDLESS:
      return { provider: "email", label: info.email ?? "Email", picture: null };
    default:
      return { provider: "email", label: info.email ?? info.name ?? "Signed in", picture };
  }
}

function message(e: unknown) {
  return e instanceof Error && e.message ? e.message : "Sign in didn't complete. Try again.";
}

/** Inside the provider: reads its hooks, registers the embedded wallet once it exists, and publishes the state up. */
function Bridge({ onState }: BridgeProps) {
  const { isInitialized, isInitializing, isConnected, connection } = useWeb3Auth();
  const { connectTo } = useWeb3AuthConnect();
  const { disconnect } = useWeb3AuthDisconnect();
  const { userInfo } = useWeb3AuthUser();
  const registered = useRef(false);

  // The embedded wallet is the Solana wallet of Web3Auth's own connector (a wallet the user connected is not ours to
  // register twice); registered once, under the site's name.
  const embedded = useMemo(
    () => (isConnected && connection?.connectorName === WALLET_CONNECTORS.AUTH ? (connection.solanaWallet as StandardWallet | null) : null),
    [isConnected, connection],
  );
  useEffect(() => {
    if (!embedded || registered.current) return;
    registerWallet(branded(embedded));
    registered.current = true;
  }, [embedded]);
  const embeddedAddress = embedded?.accounts[0]?.address ?? null;

  const loginWith = useCallback(
    async (provider: SocialProvider) => {
      try {
        await connectTo(WALLET_CONNECTORS.AUTH, { authConnection: CONNECTIONS[provider] });
      } catch (e) {
        throw new Error(message(e), { cause: e });
      }
    },
    [connectTo],
  );
  const loginWithEmail = useCallback(
    async (email: string) => {
      try {
        await connectTo(WALLET_CONNECTORS.AUTH, { authConnection: AUTH_CONNECTION.EMAIL_PASSWORDLESS, extraLoginOptions: { login_hint: email } });
      } catch (e) {
        throw new Error(message(e), { cause: e });
      }
    },
    [connectTo],
  );
  const logout = useCallback(async () => {
    await disconnect();
  }, [disconnect]);
  const exportWallet = useCallback(async () => {
    // Web3Auth answers the ed25519 secret key as hex on the connection's provider (its docs, "Fetch user's private key").
    const hex = await connection?.ethereumProvider?.request<never, string>({ method: "solana_privateKey" });
    if (!hex) throw new Error("The key could not be read. Sign in again and retry.");
    return toBase58(fromHex(hex));
  }, [connection]);

  useEffect(() => {
    onState({
      enabled: true,
      ready: isInitialized && !isInitializing,
      authenticated: isConnected,
      account: isConnected ? accountOf(userInfo) : null,
      embeddedAddress: registered.current && embeddedAddress ? embeddedAddress : null,
      loginWith,
      loginWithEmail,
      logout,
      exportWallet: embeddedAddress ? exportWallet : null,
    });
  }, [onState, isInitialized, isInitializing, isConnected, userInfo, embeddedAddress, loginWith, loginWithEmail, logout, exportWallet]);
  return null;
}

/**
 * The Web3Auth tree, a leaf beside the app (never around it): no modal of its own (the sheet is the site's), one Solana
 * chain (the cluster the API is on, with the site's own RPC), and no discovery of injected wallets, which the wallet
 * adapter already does. Wallet users never touch it.
 */
export function Web3AuthSignIn({ onState, rpcUrl, cluster }: BridgeProps) {
  const config = useMemo<Web3AuthContextConfig>(
    () => ({
      web3AuthOptions: {
        clientId: WEB3AUTH_CLIENT_ID,
        web3AuthNetwork: WEB3AUTH_NETWORK_NAME === "sapphire_devnet" ? WEB3AUTH_NETWORK.SAPPHIRE_DEVNET : WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        chains: [
          {
            chainNamespace: CHAIN_NAMESPACES.SOLANA,
            chainId: cluster === "mainnet" ? "0x1" : "0x3",
            rpcTarget: rpcUrl,
            displayName: cluster === "mainnet" ? "Solana" : "Solana devnet",
            blockExplorerUrl: "https://explorer.solana.com",
            ticker: "SOL",
            tickerName: "Solana",
            logo: "https://images.toruswallet.io/solana.svg",
          },
        ],
        defaultChainId: cluster === "mainnet" ? "0x1" : "0x3",
        multiInjectedProviderDiscovery: false,
      },
    }),
    [rpcUrl, cluster],
  );
  return (
    <Web3AuthProvider config={config}>
      <Bridge onState={onState} rpcUrl={rpcUrl} cluster={cluster} />
    </Web3AuthProvider>
  );
}
