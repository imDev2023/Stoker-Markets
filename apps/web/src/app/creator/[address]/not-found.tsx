import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell" style={{ paddingTop: 64, paddingBottom: 80 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontStretch: "112%", fontWeight: 800, margin: "0 0 12px" }}>
        Not a wallet address
      </h1>
      <p style={{ color: "var(--ink-2)", margin: "0 0 20px" }}>
        A Creator&apos;s page lives at their wallet address. Check the address and try again.
      </p>
      <Link href="/">All coins</Link>
    </div>
  );
}
