import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeIKernelLoginService } from '../napcat-core/services';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NAPCAT_SESSION_EXPIRED_REASON', undefined);
});
afterEach(() => vi.unstubAllEnvs());

async function startup () {
  const { parseNapigConfig, setNapigConfig } = await import('../napcat-common/src/config');
  setNapigConfig(parseNapigConfig('webui: {enabled: false}\naccount: {id: "123456"}'));
  const { WebUiDataRuntime: runtime } = await import('../napcat-webui-backend/src/helper/Data');
  const { createManagedLogin } = await import('../napcat-shell/managed-login');
  const { createAccountNotifications } = await import('../napcat-shell/management');
  const messages: string[] = [];
  const notifications = createAccountNotifications(message => messages.push(message), 'https://example.org');
  const unsubscribe = runtime.subscribeAccountState(state => notifications.update(state));
  return { runtime, createManagedLogin, messages, notifications, unsubscribe };
}

describe('Worker login startup notifications', () => {
  it('does not ask for QR while connecting, then accepts a saved session without an action prompt', async () => {
    const f = await startup();
    f.notifications.workerFailed('123456', 'Worker 启动失败');
    f.messages.length = 0;
    expect(f.runtime.getAccountState().phase).toBe('reconnecting');
    // onLoginConnected clears the error before awaiting native connectivity.
    f.runtime.setQQLoginError('');
    await Promise.resolve();
    expect(f.messages).toEqual([]);
    const service = { quickLoginWithUin: vi.fn().mockResolvedValue({ result: '0' }), getMsfStatus: () => 1 };
    const qr = vi.fn(() => true);
    const flow = f.createManagedLogin(service as unknown as NodeIKernelLoginService, qr, true);
    await flow.start('auto');
    f.runtime.setQQLoginStatus(true);
    f.runtime.setQQLoginPhase('initializing');
    flow.clear();
    await Promise.resolve();
    expect(f.messages).toEqual([]);
    f.runtime.setQQLoginPhase('ready');
    await Promise.resolve();
    expect(f.messages).toEqual(['QQ 123456 已恢复在线']);
    expect(qr).not.toHaveBeenCalled();
    f.unsubscribe();
    f.notifications.stop();
  });
});
