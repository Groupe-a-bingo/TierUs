"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 2000;

/**
 * Polls a tiny version fingerprint and re-renders the page (server side, so
 * every visibility rule is re-applied) only when something actually changed.
 * `initial` is the version the page was rendered with, so nothing that
 * happens before the first poll is missed. Pauses when the tab is hidden.
 */
export function LiveRefresh({ roundId, initial }: { roundId?: string; initial: string }) {
  const router = useRouter();
  const last = useRef(initial);

  // a fresh server render brings a fresh baseline
  useEffect(() => {
    last.current = initial;
  }, [initial]);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | undefined;
    const url = roundId ? `/api/live?round=${roundId}` : "/api/live";

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, INTERVAL_MS);
    };

    const tick = async () => {
      if (stopped || inFlight) return;
      if (document.visibilityState === "visible") {
        inFlight = true;
        ctrl = new AbortController();
        try {
          const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
          if (res.ok) {
            const { v } = (await res.json()) as { v: string };
            if (v !== last.current) {
              last.current = v;
              router.refresh();
            }
          }
        } catch {
          /* offline / aborted: retry next tick */
        } finally {
          inFlight = false;
        }
      }
      schedule();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !inFlight) tick();
    };

    schedule();
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
