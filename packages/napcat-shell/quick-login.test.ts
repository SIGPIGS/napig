import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickLoginFlow } from './quick-login';

describe('phone confirmation during quick login', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fixture (login = vi.fn().mockResolvedValue({ result: '4' })) {
    const callbacks = {
      login,
      onResponse: vi.fn(),
      onWaiting: vi.fn(),
      onSuccess: vi.fn(),
      onBackgroundFailure: vi.fn(),
    };
    return { flow: createQuickLoginFlow(callbacks), ...callbacks };
  }

  it('waits for the native success event without reissuing phone requests', async () => {
    const f = fixture();
    expect(await f.flow.start('123')).toMatchObject({ needPhoneConfirm: true, result: false });
    expect(await f.flow.start('123')).toMatchObject({ needPhoneConfirm: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.login).toHaveBeenCalledTimes(1);
    expect(f.onWaiting).toHaveBeenCalledOnce();
    // The native login-success listener completes Core initialization and ends this wait.
    f.flow.cancel();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(f.onBackgroundFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends an unconfirmed login at the deadline', async () => {
    const f = fixture();
    await f.flow.start('123');
    await vi.advanceTimersByTimeAsync(180_000);
    expect(f.login).toHaveBeenCalledTimes(1);
    expect(f.onBackgroundFailure).toHaveBeenCalledExactlyOnceWith('手机确认已超时，请重新登录');
    expect(f.flow.isWaiting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a late native reply after switching login flows', async () => {
    let reply!: (value: { result: string; }) => void;
    const f = fixture(vi.fn().mockImplementationOnce(() => new Promise(resolve => { reply = resolve; })));
    const pending = f.flow.start('123');
    f.flow.cancel();
    reply({ result: '4' });
    expect(await pending).toMatchObject({ cancelled: true });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(f.onWaiting).not.toHaveBeenCalled();
    expect(f.onBackgroundFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
