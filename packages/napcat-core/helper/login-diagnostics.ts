import { randomUUID } from 'node:crypto';

/** One ID per Worker lifetime, shared by login, packet and recovery diagnostics. */
export const loginDiagnosticId = randomUUID();

/** Small, explicit snapshot: never serialize native sessions, env or login responses. */
export function getLoginDiagnostics (readMsfStatus?: () => number) {
  let msfStatus: number | null = null;
  if (readMsfStatus) {
    try {
      msfStatus = readMsfStatus();
    } catch {
      // Native login services can already be torn down when a disconnect arrives.
    }
  }
  return {
    timestamp: new Date().toISOString(),
    diagnosticId: loginDiagnosticId,
    pid: process.pid,
    ppid: process.ppid,
    uptimeMs: Math.round(process.uptime() * 1000),
    rssBytes: process.memoryUsage().rss,
    msfStatus,
  };
}
