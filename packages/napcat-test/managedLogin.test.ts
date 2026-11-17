import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createManagedLogin } from '../napcat-shell/managed-login';
import { WebUiDataRuntime as runtime } from '../napcat-webui-backend/src/helper/Data';
import { parseNapigConfig, setNapigConfig } from '../napcat-common/src/config';
import type { NodeIKernelLoginService } from '../napcat-core/services';

beforeEach(() => {
  vi.useFakeTimers();
  setNapigConfig(parseNapigConfig('webui: {enabled: false}\naccount: {id: "123456", password: "only-in-worker"}'));
  runtime.setQQLoginStatus(false);
  runtime.setOneBotContext(null);
  runtime.setQQSessionExpiredReason('');
  runtime.setAccountReason(undefined, '');
  runtime.setQQLoginPhase('offline');
  runtime.setLoginAttempt(undefined);
});
afterEach(() => vi.useRealTimers());
function fixture (saved = false) {
  const service = { passwordLogin: vi.fn(), quickLoginWithUin: vi.fn(), getMsfStatus: () => 1 };
  const qr = vi.fn(() => true);
  const flow = createManagedLogin(service as unknown as NodeIKernelLoginService, qr, saved);
  return { flow, service, qr };
}

describe('single managed account login', () => {
  it('keeps password and device signature private and resumes challenges through later WebUI requests', async () => {
    const { flow, service } = fixture();
    service.passwordLogin.mockResolvedValueOnce({ result: '140022008', loginErrorInfo: { proofWaterUrl: 'https://captcha.qq.com/test' } })
      .mockResolvedValueOnce({ result: '140022010', loginErrorInfo: { jumpUrl: 'https://accounts.qq.com/verify', newDevicePullQrCodeSig: 'private-signature' } })
      .mockResolvedValueOnce({ result: '0' });
    expect((await flow.start('auto')).result).toBe(true);
    const view = runtime.getLoginAttempt()!;
    expect(runtime.getQQLoginPhase()).toBe('captcha_required');
    expect(JSON.stringify(view)).not.toContain('only-in-worker');
    expect(JSON.stringify(view)).not.toContain(service.passwordLogin.mock.calls[0]![0].passwordMd5);
    expect(await runtime.requestCaptchaLogin('stale', 'ticket', 'random', '')).toMatchObject({ result: false });
    await runtime.requestCaptchaLogin(view.id, 'ticket', 'random', 'sid');
    expect(runtime.getQQLoginPhase()).toBe('device_verification');
    expect(JSON.stringify(runtime.getLoginAttempt())).not.toContain('private-signature');
    await runtime.requestNewDeviceLogin(view.id, '');
    const request = service.passwordLogin.mock.calls[2]![0];
    expect(request.uin).toBe('123456');
    expect(new TextDecoder().decode(request.newDeviceLoginSig)).toBe('private-signature');
    expect(request.passwordMd5).toBe(service.passwordLogin.mock.calls[0]![0].passwordMd5);
    expect(runtime.getQQLoginStatus()).toBe(false);
    expect(runtime.getQQLoginPhase()).toBe('logging_in');
    flow.clear();
  });

  it('permits QR after a hung password request expires and ignores its late challenge', async () => {
    const { flow, service, qr } = fixture();
    let finish!: (value: unknown) => void;
    service.passwordLogin.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = flow.start('auto');
    await vi.advanceTimersByTimeAsync(180_000);
    expect(runtime.getQQLoginPhase()).toBe('offline');
    await flow.start('qr');
    expect(qr).toHaveBeenCalledOnce();
    finish({ result: '140022008', loginErrorInfo: { proofWaterUrl: 'stale' } });
    await pending;
    expect(runtime.getQQLoginPhase()).toBe('generating_qrcode');
    expect(runtime.getLoginAttempt()?.proofWaterUrl).toBeUndefined();
    flow.clear();
  });

  it.each([false, true])('handles native success before the login Promise (quick=%s)', async saved => {
    const { flow, service } = fixture(saved);
    const action = saved ? service.quickLoginWithUin : service.passwordLogin;
    action.mockImplementation(async () => {
      runtime.setQQLoginStatus(true);
      runtime.setQQLoginPhase('initializing');
      flow.clear();
      return { result: '0' };
    });
    expect(await flow.start('auto')).toMatchObject({ result: true });
    expect(runtime.getQQLoginPhase()).toBe('initializing');
  });

  it('waits for phone confirmation without trying the configured password', async () => {
    const { flow, service } = fixture(true);
    service.quickLoginWithUin.mockResolvedValue({ result: '4' });
    await flow.start('auto');
    await flow.start('auto');
    expect(service.quickLoginWithUin).toHaveBeenCalledExactlyOnceWith('123456');
    expect(service.passwordLogin).not.toHaveBeenCalled();
    expect(runtime.getQQLoginPhase()).toBe('waiting_phone_confirm');
    flow.clear();
  });
});
