import { ImageResponse } from "next/og";
import { getLaunch } from "@/lib/api";
import { quoteTicker } from "@/lib/format";
import { clip } from "@/lib/meta";
import { CARD, DISPLAY, pairSize, SHARE_SIZE, ShareFrame, shareFonts } from "@/lib/share";

/**
 * A coin's share card (#83), as its link unfurls on X or Telegram: its picture, the pair it trades as, its name, its
 * description and, for a Reward Launch, the tax its holders are paid from. Only what was fixed at launch, since a
 * crawler keeps the card it fetched; the live figures are on the page.
 */
export const alt = "A coin on Stoker and the asset it is paired with";
export const size = SHARE_SIZE;
export const contentType = "image/png";

/**
 * The coin's picture as Satori can place it, from the API's copy; the monogram stands in when there is none, when it
 * is in a format the renderer can't read, or when it doesn't arrive in time.
 */
async function picture(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(png|jpeg|gif)$/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const launch = await getLaunch(mint);
  if (!launch) return new Response("No coin at this address", { status: 404 });
  const quote = quoteTicker(launch.quote);
  const pair = `${launch.symbol} / ${quote}`;
  const image = await picture(launch.image);
  const tax = launch.rewardTax ? `Reward Launch · ${launch.rewardTax.bps / 100}% of every trade to its holders` : null;
  const box = { width: 320, height: 320, borderRadius: 28, border: `1px solid ${CARD.line}`, flexShrink: 0 } as const;
  return new ImageResponse(
    (
      <ShareFrame>
        <div style={{ display: "flex", alignItems: "center", gap: 56, flexGrow: 1 }}>
          {image ? (
            <img src={image} width={320} height={320} alt="" style={{ ...box, objectFit: "cover" }} />
          ) : (
            <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", background: CARD.surface, fontFamily: DISPLAY, fontWeight: 800, fontSize: 160, color: CARD.ink3 }}>
              {launch.symbol.charAt(0)}
            </div>
          )}
          {/* The column has the width the picture and the gaps leave, so every line wraps inside the card. */}
          <div style={{ display: "flex", flexDirection: "column", width: 696 }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 1.8, textTransform: "uppercase", color: CARD.accent }}>Paired with {quote}</div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 18, marginTop: 12, fontFamily: DISPLAY, fontWeight: 800, fontSize: pairSize(pair), lineHeight: 1, letterSpacing: -2 }}>
              <span>{launch.symbol}</span>
              <span style={{ color: CARD.ink3, fontWeight: 700 }}>/</span>
              <span>{quote}</span>
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 40, lineHeight: 1.15, color: CARD.ink2 }}>{launch.name}</div>
            {launch.description && (
              <div style={{ display: "flex", marginTop: 14, fontSize: 26, lineHeight: 1.35, color: CARD.ink3 }}>{clip(launch.description, 140)}</div>
            )}
            {tax && (
              <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 22, padding: "8px 16px", borderRadius: 999, border: `1px solid ${CARD.line}`, fontSize: 22, color: CARD.ink2 }}>
                {tax}
              </div>
            )}
          </div>
        </div>
      </ShareFrame>
    ),
    { ...size, fonts: shareFonts(), headers: { "cache-control": "public, max-age=86400" } },
  );
}
