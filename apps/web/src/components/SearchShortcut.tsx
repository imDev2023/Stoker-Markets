"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SEARCH_HASH, SITE_SEARCH_ATTRIBUTE } from "@/lib/search";

/**
 * "/" and ⌘K (Ctrl+K elsewhere) reach the site's one search, the board's (owner, 2026-10-31: the header's own search
 * left it). On the board the field takes focus in place; from any other page the keys open the board with the field
 * focused (`#search`, which the board drops once it has answered it). A slash typed inside a field stays a character.
 * Nothing is rendered.
 */
export function SearchShortcut() {
  const router = useRouter();
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
    const onKey = (e: KeyboardEvent) => {
      const command = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target);
      if (!command && !slash) return;
      e.preventDefault();
      const field = document.querySelector<HTMLInputElement>(`[${SITE_SEARCH_ATTRIBUTE}]`);
      if (field) {
        field.focus();
        field.select();
      } else {
        router.push(`/coins${SEARCH_HASH}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
