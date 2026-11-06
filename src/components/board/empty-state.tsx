import { cn } from "@/lib/utils";

/** One consistent, centred "nothing here" message for every list in the app. */
export function EmptyState({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return <p className={cn("w-full flex-1 self-center text-center text-sm text-muted-foreground", inline ? "py-0" : "py-6")}>{children}</p>;
}
