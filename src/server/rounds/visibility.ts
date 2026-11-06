/**
 * Can this viewer see results (average, others' tier lists, discussion)?
 * Only once they've sent their own answer for this tier list. Active or
 * archived makes no difference: archiving never shows anything by itself.
 */
export function canSeeResults({ hasSubmitted }: { hasSubmitted: boolean }): boolean {
  return hasSubmitted;
}
