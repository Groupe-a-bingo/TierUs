export type RoundVisibilityInput = {
  revealed: boolean;
  isCurrent: boolean;
  hasSubmitted: boolean;
};

/**
 * Can this viewer see results (average + others' tier lists)?
 * - Never before reveal.
 * - Current round: only once you've submitted yours.
 * - Archives: open to every validated member (full history).
 */
export function canSeeResults({ revealed, isCurrent, hasSubmitted }: RoundVisibilityInput): boolean {
  if (!revealed) return false;
  if (isCurrent) return hasSubmitted;
  return true;
}
