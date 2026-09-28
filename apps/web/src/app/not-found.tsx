import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell" style={{ paddingTop: 64, paddingBottom: 80 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontStretch: "112%", fontWeight: 800, margin: "0 0 12px" }}>
        No coin at this address
      </h1>
      <p style={{ color: "var(--ink-2)", margin: "0 0 20px" }}>
        It may still be confirming. Check the address, or wait a few seconds and reload.
      </p>
      <Link href="/">All coins</Link>
    </div>
  );
}
