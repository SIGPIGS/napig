import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccountNotifications, createLoginRequests } from '@/napcat-shell/management';
import type { AccountState } from '@/napcat-webui-backend/src/helper/Data';

const state = (extra: Partial<AccountState>): AccountState => ({ account: '12345', phase: 'offline', reason: '', ...extra });
afterEach(() => vi.useRealTimers());

describe('Master account notifications', () => {
  it('ignores short SelfOffline events and notifies once on sustained loss and recovery', () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    const manager = createAccountNotifications(notify, 'https://example.test/webui/qq_login');
    manager.update(state({ reasonKind: 'self_offline' }));
    vi.advanceTimersByTime(30_000);
    manager.update(state({ phase: 'ready' }));
    vi.advanceTimersByTime(60_000);
    expect(notify).not.toHaveBeenCalled();
    manager.update(state({ reasonKind: 'self_offline' }));
    vi.advanceTimersByTime(60_000);
    manager.update(state({ reasonKind: 'self_offline' }));
    vi.advanceTimersByTime(120_000);
    expect(notify).toHaveBeenCalledTimes(1);
    manager.update(state({ phase: 'ready' }));
    manager.update(state({ phase: 'ready' }));
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[1]![0]).toContain('已恢复在线');
    manager.stop();
  });

  it('immediately reports kick/expired identity and deduplicates native callbacks', () => {
    const notify = vi.fn();
    const manager = createAccountNotifications(notify, '');
    manager.update(state({ reasonKind: 'kicked', reason: '已被踢' }));
    manager.update(state({ reasonKind: 'session_expired', reason: '身份失效' }));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![0]).toContain('已被踢');
    expect(notify.mock.calls[0]![0]).not.toContain('登录页面：/');
    manager.update(state({ phase: 'ready' }));
    manager.workerFailed('12345', 'Worker 崩溃');
    expect(notify).toHaveBeenCalledTimes(3);
    manager.update(state({ phase: 'waiting_qrcode', attemptId: 'first' }));
    manager.update(state({ phase: 'waiting_qrcode', attemptId: 'first' }));
    manager.update(state({ phase: 'waiting_qrcode', attemptId: 'second' }));
    expect(notify).toHaveBeenCalledTimes(5);
    manager.stop();
  });
});

it('ignores late login replies from an exited Worker', async () => {
  vi.useFakeTimers();
  const sent: number[] = [];
  const requests = createLoginRequests(id => { sent.push(id); });
  const old = requests.request('qr');
  expect(requests.request('auto')).toBe(old);
  requests.workerExited();
  expect((await old).result).toBe(false);
  const current = requests.request('auto');
  requests.receive(sent[0]!, { result: true, message: 'stale' });
  requests.receive(sent[1]!, { result: true, message: 'current' });
  expect((await current).message).toBe('current');
  const timed = requests.request('auto');
  vi.advanceTimersByTime(15_000);
  expect((await timed).message).toContain('超时');
});
