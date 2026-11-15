"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 2000;
/** After failures the delay doubles up to this (server down, offline, rate limited). */
const MAX_INTERVAL_MS = 30_000;

/**
 * Polls a tiny version fingerprint and re-renders the page (server side, so
 * every visibility rule is re-applied) only when something actually changed.
 * `initial` is the version the page was rendered with, so nothing that
 * happens before the first poll is missed. Stops while the tab is hidden
 * (no timer at all), and backs off after errors.
 */
export function LiveRefresh({ roundId, scope, initial }: { roundId?: string; scope?: "mod" | "ideas"; initial: string }) {
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
    let delay = INTERVAL_MS;
    const url = roundId ? `/api/live?round=${roundId}` : scope ? `/api/live?scope=${scope}` : "/api/live";

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      // hidden tab: nothing scheduled, the visibility listener restarts it
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      ctrl = new AbortController();
      let ok = false;
      try {
        const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        if (res.ok) {
          ok = true;
          const { v } = (await res.json()) as { v: string };
          if (v !== last.current) {
            last.current = v;
            router.refresh();
          }
        }
      } catch {
        /* offline / aborted */
      } finally {
        inFlight = false;
      }
      delay = ok ? INTERVAL_MS : Math.min(MAX_INTERVAL_MS, delay * 2);
      schedule();
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        if (timer) clearTimeout(timer);
        timer = undefined;
      } else if (!inFlight) tick();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roundId, scope, router]);

  return null;
}
