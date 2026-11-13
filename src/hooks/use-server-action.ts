"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/errors";

type Options<T> = {
  /** toast on success (or built from the action's data) */
  success?: string | ((data: T | undefined) => string);
  /** ask first (native confirm) */
  confirm?: string;
  /** reload the page after a refusal: usually it was out of date (already reviewed, edited…) */
  refreshOnError?: boolean;
  onSuccess?: (data: T | undefined) => void;
  /** after a refusal or a network failure (e.g. roll back local state) */
  onError?: () => void;
};

/**
 * The one way components call a server action: pending state, a toast for
 * the result, and a network failure (offline, server down) reported as a
 * toast instead of escaping the transition and replacing the page with the
 * error screen (which would lose what the member was doing).
 */
export function useServerAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run<T>(action: () => Promise<ActionResult<T>>, opts: Options<T> = {}) {
    if (opts.confirm && !window.confirm(opts.confirm)) return;
    startTransition(async () => {
      let res: ActionResult<T>;
      try {
        res = await action();
      } catch {
        toast.error("Connexion perdue : vérifie ton réseau et réessaie");
        opts.onError?.();
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        if (opts.refreshOnError) router.refresh();
        opts.onError?.();
        return;
      }
      const message = typeof opts.success === "function" ? opts.success(res.data) : opts.success;
      if (message) toast.success(message);
      opts.onSuccess?.(res.data);
    });
  }

  return { pending, run };
}
