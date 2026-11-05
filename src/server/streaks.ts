/**
 * Streaks are counted in rounds, not calendar days: a day without a round
 * (empty idea bank) doesn't break anyone's streak.
 */

/** New streak after playing the current round on time. */
export function nextStreak(opts: {
  current: number;
  lastPlayed: string | null;
  roundDate: string;
  previousRoundDate: string | null;
}): number {
  const { current, lastPlayed, roundDate, previousRoundDate } = opts;
  if (lastPlayed === roundDate) return current; // already counted
  if (previousRoundDate && lastPlayed === previousRoundDate) return current + 1;
  return 1;
}

/** Streak to display: 0 if the user missed the previous round and hasn't played today's. */
export function displayStreak(opts: {
  streak: number;
  lastPlayed: string | null;
  currentRoundDate: string | null;
  previousRoundDate: string | null;
}): number {
  const { streak, lastPlayed, currentRoundDate, previousRoundDate } = opts;
  if (!lastPlayed) return 0;
  if (lastPlayed === currentRoundDate) return streak;
  if (lastPlayed === previousRoundDate) return streak; // still alive, play today to keep it
  if (!currentRoundDate) return streak; // no round at all yet
  return 0;
}
