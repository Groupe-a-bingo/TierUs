"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 2000;

/**
 * Polls a tiny version fingerprint and re-renders the page (server side, so
 * every visibility rule is re-applied) only when something actually changed.
 * Pauses when the tab is hidden, catches up instantly when it comes back.
 */
export function LiveRefresh({ roundId }: { roundId?: string }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | undefined;
    const url = roundId ? `/api/live?round=${roundId}` : "/api/live";

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        ctrl = new AbortController();
        try {
          const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
          if (res.ok) {
            const { v } = (await res.json()) as { v: string };
            if (last.current !== null && v !== last.current) router.refresh();
            last.current = v;
          }
        } catch {
          /* offline / aborted: retry next tick */
        }
      }
      if (!stopped) timer = setTimeout(tick, INTERVAL_MS);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roundId, router]);

  return null;
}
