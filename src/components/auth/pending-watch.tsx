"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Pending page: re-check every 10s so a validated member gets in without reloading. */
export function PendingWatch() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
