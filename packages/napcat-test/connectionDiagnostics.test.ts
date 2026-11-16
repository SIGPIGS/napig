import { describe, expect, test } from 'vitest';
import { ConnectionDiagnostics, summarizeLoginArguments } from '../napcat-core/helper/connection-diagnostics';

describe('connection diagnostics history', () => {
  test('aggregates metadata, bounds memory and expires old packets using monotonic time', () => {
    let now = 0;
    const history = new ConnectionDiagnostics(() => now, 2, 300_000);
    history.recordPacket({ type: 0, cmd: 'Login.Test', seq: 1, bytes: 10 });
    history.recordPacket({ type: 0, cmd: 'Login.Test', seq: 2, bytes: 20 });
    expect(history.snapshot().packetBuckets).toEqual([expect.objectContaining({ count: 2, lastSeq: 2, lastBytes: 20 })]);
    now = 1000;
    history.recordPacket({ type: 1, cmd: 'Reply.Test', seq: 3, bytes: 30 });
    now = 2000;
    history.recordPacket({ type: 0, cmd: 'Other.Test', seq: 4, bytes: 40 });
    expect(history.snapshot().packetBuckets).toHaveLength(2);
    expect(history.snapshot().evictedBuckets).toBe(1);
    expect(history.activity()).toEqual({ lastSendAgoMs: 0, lastReceiveAgoMs: 1000 });
    now = 303_000;
    expect(history.snapshot().packetBuckets).toHaveLength(0);
  });

  test('rejects non-command text and never retains extra packet fields', () => {
    const history = new ConnectionDiagnostics();
    const input = { type: 1 as const, cmd: 'secret payload ?token=value', seq: 1, bytes: 20, hex_data: 'sensitive-body', uin: 'private-account' };
    history.recordPacket(input);
    const serialized = JSON.stringify(history.snapshot());
    expect(serialized).toContain('<invalid-command>');
    for (const secret of ['sensitive-body', 'private-account', 'token=value']) expect(serialized).not.toContain(secret);
  });

  test('keeps only a bounded sample history', () => {
    let now = 0;
    const history = new ConnectionDiagnostics(() => now);
    for (let i = 0; i < 30; i++) history.recordSample({ index: i });
    expect(history.snapshot().samples).toHaveLength(20);
    expect(history.snapshot().samples[0]).toEqual({ index: 10 });
    now = 300_001;
    expect(history.snapshot().samples).toHaveLength(0);
  });
});

describe('native login argument summaries', () => {
  test('keeps scalar codes without dumping credentials, strings or nested objects', () => {
    const summary = summarizeLoginArguments([{
      state: 1,
      result: '140022015',
      errCode: 'token-secret',
      token: 'cookie-secret',
      nested: { state: 99 },
    }, 'login-secret', 2, { code: 3 }, 'ignored-secret']);
    expect(summary).toEqual({
      argumentCount: 5,
      arguments: [{ type: 'object', codes: { state: 1, result: '140022015' } }, { type: 'string', length: 12 }, 2, { type: 'object', codes: { code: 3 } }],
    });
    expect(JSON.stringify(summary)).not.toContain('secret');
  });
});
