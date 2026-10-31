import { ImageResponse } from "next/og";
import { getPlatform } from "@/lib/api";
import { creatorEarnings } from "@/lib/fees";
import { SITE_CARD } from "@/lib/meta";
import { CARD, DISPLAY, RING, SHARE_SIZE, ShareFrame, shareFonts } from "@/lib/share";

/**
 * The site's share card (#83), as a link to any page without a card of its own unfurls: the slogan with its emphasised
 * half in the heat, the lede with the creator's cut from the chain, and the ring. A coin's page draws its own.
 */
export const alt = SITE_CARD.alt;
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const platform = await getPlatform();
  const earns = creatorEarnings(platform);
  return new ImageResponse(
    (
      <ShareFrame>
        <img src={RING} width={560} height={560} alt="" style={{ position: "absolute", right: -150, top: 36 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 780 }}>
          {/* The slogan on three lines, its emphasised half in the heat, as the hero sets it (owner, 2026-10-09). */}
          <div style={{ display: "flex", flexDirection: "column", fontFamily: DISPLAY, fontWeight: 700, fontSize: 90, lineHeight: 0.98, letterSpacing: -2.7 }}>
            <span>No one picks</span>
            <span>your pair.</span>
            <span style={{ backgroundImage: `linear-gradient(90deg, ${CARD.heatLow}, ${CARD.heatHigh})`, backgroundClip: "text", color: "transparent" }}>You do.</span>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 28, lineHeight: 1.35, color: CARD.ink2 }}>
            Launch a coin on Solana priced in SOL, a stablecoin, a tokenized stock or any asset Raydium quotes. Creators earn {earns.headline}.
          </div>
        </div>
      </ShareFrame>
    ),
    { ...size, fonts: shareFonts(), headers: { "cache-control": "public, max-age=3600" } },
  );
}
