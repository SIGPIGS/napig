import { describe, expect, test } from 'vitest';
import { getLoginDiagnostics } from '../napcat-core/helper/login-diagnostics';

describe('login diagnostics', () => {
  test('captures native MSF state with an unambiguous timestamp and process context', () => {
    const snapshot = getLoginDiagnostics(() => 2);
    expect(snapshot.msfStatus).toBe(2);
    expect(snapshot.pid).toBe(process.pid);
    expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(snapshot.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.rssBytes).toBeGreaterThan(0);
  });

  test('survives a torn-down native service without logging the exception payload', () => {
    const snapshot = getLoginDiagnostics(() => { throw new Error('sensitive native payload'); });
    expect(snapshot.msfStatus).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('sensitive native payload');
  });
});
