"use client";

import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/dates";

/** "encore 12 min", kept up to date in the browser (the page itself only re-renders on changes). */
export function Countdown({ expiresAt }: { expiresAt: string }) {
  const end = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  // the server and the browser may round to a different minute
  return <span suppressHydrationWarning>{formatRemaining(end - now)}</span>;
}
