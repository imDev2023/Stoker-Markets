"use client";

import { useWallet, type WalletContextState } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import { WalletButton } from "./WalletButton";
import styles from "./SwapWidget.module.css";

/**
 * Jupiter Plugin (developers.jup.ag/docs/tool-kits/plugin): the v1 script is the one address Jupiter publishes, so
 * it is pinned to that major; the UI suite serves it empty (tests/ui/src/fixtures.ts), so no baseline ever carries a live swap.
 */
const PLUGIN_SCRIPT = "https://plugin.jup.ag/plugin-v1.js";
const TARGET_ID = "jupiter-plugin";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** The integrated form needs a fixed height, or its token search collapses it (the Plugin's FAQ). */
const HEIGHT = 568;
/**
 * The referral account the owner creates on referral.jup.ag and sets at build time, and the fee it takes (50 to 255
 * basis points, of which Jupiter keeps 20%); without the account no fee is charged and the swap is Jupiter's plain one.
 */
const REFERRAL = process.env.NEXT_PUBLIC_JUPITER_REFERRAL ?? "";
const REFERRAL_FEE_BPS = Math.min(255, Math.max(50, Number(process.env.NEXT_PUBLIC_JUPITER_REFERRAL_FEE_BPS ?? "50") || 50));

/** The slice of the Plugin's surface this component touches (its full declaration is in the Plugin's repository). */
type JupiterPlugin = {
  init: (props: Record<string, unknown>) => void;
  syncProps: (props: { passthroughWalletContextState?: WalletContextState }) => void;
  close?: () => void;
};

declare global {
  interface Window {
    Jupiter?: JupiterPlugin;
  }
}

/**
 * The Plugin's colours are RGB triplets read from custom properties. The Plugin sets some of its text white whatever
 * the triplets say, so a light surface leaves it unreadable: it is given a dark tile in both schemes, like the mark
 * (`--tile` is dark everywhere), in Teal's dark tokens (globals.css): the primary is the accent, the background the
 * canvas, the module the surface a card sits on, the interactive the well a field sits in, the warning the heat.
 */
const PLUGIN_THEME: Record<string, string> = {
  "--jupiter-plugin-primary": "47, 211, 192",
  "--jupiter-plugin-background": "5, 9, 14",
  "--jupiter-plugin-primaryText": "234, 243, 245",
  "--jupiter-plugin-warning": "255, 122, 61",
  "--jupiter-plugin-interactive": "17, 26, 36",
  "--jupiter-plugin-module": "11, 18, 25",
};

/** Sets the Plugin's variables on the root, since its token search opens at the body's level, outside our box. */
function theme() {
  for (const [name, value] of Object.entries(PLUGIN_THEME)) document.documentElement.style.setProperty(name, value);
}

function untheme() {
  for (const name of Object.keys(PLUGIN_THEME)) document.documentElement.style.removeProperty(name);
}

let plugin: Promise<JupiterPlugin> | undefined;

/** Loads the Plugin's script once per page; the promise lives outside any mount, so React's development double-mount can't strand it. */
function loadPlugin(): Promise<JupiterPlugin> {
  if (window.Jupiter) return Promise.resolve(window.Jupiter);
  plugin ??= new Promise<JupiterPlugin>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLUGIN_SCRIPT;
    script.async = true;
    script.onload = () => (window.Jupiter ? resolve(window.Jupiter) : reject(new Error(`${PLUGIN_SCRIPT} did not define the Plugin`)));
    script.onerror = () => reject(new Error(`${PLUGIN_SCRIPT} did not load`));
    document.head.append(script);
  });
  return plugin;
}

type State = "loading" | "ready" | "failed";

/**
 * The token swap in the hero (#133, candidate H, owner 2026-10-30): Jupiter Plugin in integrated mode, SOL to USDC as
 * the opening pair, the wallet passed through from our adapter so one connect serves the whole site, and the colours
 * from our tokens on a dark tile in both schemes. The widget swaps on Solana mainnet from the browser whatever cluster the API is on;
 * everything else on the site stays a client of our API. A referral fee applies once `NEXT_PUBLIC_JUPITER_REFERRAL` is set.
 */
export function SwapWidget() {
  const wallet = useWallet();
  const [state, setState] = useState<State>("loading");
  const connect = useRef<HTMLDivElement>(null);
  const latest = useRef(wallet);
  latest.current = wallet;

  useEffect(() => {
    theme();
    return untheme;
  }, []);

  useEffect(() => {
    let gone = false;
    loadPlugin().then(
      (jupiter) => {
        if (gone) return;
        jupiter.init({
          displayMode: "integrated",
          integratedTargetId: TARGET_ID,
          enableWalletPassthrough: true,
          passthroughWalletContextState: latest.current,
          // Our own connect: the Plugin asks, and the wallet button beside it opens.
          onRequestConnectWallet: () => connect.current?.querySelector("button")?.click(),
          formProps: {
            initialInputMint: SOL,
            initialOutputMint: USDC,
            ...(REFERRAL ? { referralAccount: REFERRAL, referralFee: REFERRAL_FEE_BPS } : {}),
          },
          containerStyles: { height: `${HEIGHT}px` },
          branding: { name: "Stoker", logoUri: "/icon.png" },
        });
        setState("ready");
      },
      () => {
        if (!gone) setState("failed");
      },
    );
    return () => {
      gone = true;
      window.Jupiter?.close?.();
    };
  }, []);

  // The connected wallet reaches the Plugin as it changes: one connect for the site.
  useEffect(() => {
    if (state === "ready") window.Jupiter?.syncProps({ passthroughWalletContextState: wallet });
  }, [state, wallet]);

  return (
    <div className={styles.swap}>
      <div className={styles.frame} data-state={state} style={{ minHeight: HEIGHT }}>
        <div id={TARGET_ID} className={styles.target} />
        {state !== "ready" && (
          <p className={styles.status} role="status">
            <span>
              {state === "loading" ? (
                "Loading Jupiter's swap"
              ) : (
                <>
                  Jupiter&apos;s swap did not load here.{" "}
                  <a href="https://jup.ag/swap/SOL-USDC" target="_blank" rel="noreferrer">Open jup.ag</a> instead.
                </>
              )}
            </span>
          </p>
        )}
      </div>
      <div className={styles.foot}>
        <p className={styles.note}>Any Solana token for any other, through Jupiter, on mainnet.</p>
        {!wallet.publicKey && (
          <div ref={connect} className={styles.connect}>
            <WalletButton variant="inline" />
          </div>
        )}
      </div>
    </div>
  );
}
