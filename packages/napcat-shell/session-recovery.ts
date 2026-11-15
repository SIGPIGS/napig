/** Survives Worker replacement so a successful login cannot reset a crash loop. */
export function createSessionRecoveryBudget (now = () => Date.now(), windowMs = 10 * 60_000) {
  let lastAttempt: number | undefined;
  return () => {
    const current = now();
    if (lastAttempt !== undefined && current - lastAttempt < windowMs) return false;
    lastAttempt = current;
    return true;
  };
}
