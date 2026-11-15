import { expect, it } from 'vitest';
import { createSessionRecoveryBudget } from './session-recovery';

it('allows one automatic recovery per window across Worker replacements', () => {
  let now = 0;
  const allowRecovery = createSessionRecoveryBudget(() => now);
  expect(allowRecovery()).toBe(true);
  expect(allowRecovery()).toBe(false);
  now = 599_999;
  expect(allowRecovery()).toBe(false);
  now = 600_000;
  expect(allowRecovery()).toBe(true);
  expect(allowRecovery()).toBe(false);
});
