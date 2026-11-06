/** Instant placeholder shown while a page renders on the server. */
export function PageSkeleton({ variant = "list" }: { variant?: "list" | "post" }) {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-40 rounded-xl bg-secondary" />
      {variant === "post" ? (
        <>
          <div className="h-10 w-full rounded-xl bg-secondary" />
          <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-board-edge">
            {["w-16 opacity-40 bg-tier-s", "w-16 opacity-40 bg-tier-a", "w-16 opacity-40 bg-tier-b", "w-16 opacity-40 bg-tier-c", "w-16 opacity-40 bg-tier-d", "w-16 opacity-40 bg-tier-f"].map((c) => (
              <div key={c} className="flex h-16 border-b-2 border-board">
                <div className={c} />
                <div className="flex-1 bg-board-row" />
              </div>
            ))}
          </div>
          <div className="h-64 rounded-3xl bg-secondary" />
        </>
      ) : (
        [0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-secondary" />)
      )}
    </div>
  );
}
