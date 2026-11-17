import { createHash, randomUUID } from 'node:crypto';
import type { NodeIKernelLoginService } from 'napcat-core/services';
import { WebUiDataRuntime as runtime } from 'napcat-webui-backend/src/helper/Data';
import { getNapigConfig } from 'napcat-common/src/config';
import { createQuickLoginFlow } from './quick-login';

/** The password and challenge signature never leave this Worker. */
export function createManagedLogin (service: NodeIKernelLoginService, requestQR: () => boolean, hasSavedAccount: boolean) {
  const account = getNapigConfig().account;
  let attempt: { id: string; passwordMd5?: string; deviceSignature?: string } | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    attempt = undefined;
    clearTimeout(deadline);
    quick.cancel();
    runtime.setLoginAttempt(undefined);
  };
  const fail = (message: string) => {
    clear();
    runtime.setAccountReason('login_failed', message);
    runtime.setQQLoginPhase('offline');
    return { result: false, message };
  };
  const quick = createQuickLoginFlow({
    login: uin => service.quickLoginWithUin(uin),
    onResponse: () => {},
    onWaiting: () => runtime.setQQLoginPhase('waiting_phone_confirm'),
    onSuccess: () => { if (!runtime.getQQLoginStatus()) runtime.setQQLoginPhase('logging_in'); },
    onBackgroundFailure: message => { fail(message); },
  });
  const password = async (step: number, fields: Partial<Parameters<NodeIKernelLoginService['passwordLogin']>[0]> = {}) => {
    const current = attempt;
    if (!current?.passwordMd5) return { result: false, message: '登录已失效，请重新登录' };
    runtime.setQQLoginPhase('logging_in');
    try {
      const res = await service.passwordLogin({
        uin: account.id,
        passwordMd5: current.passwordMd5,
        step,
        newDeviceLoginSig: new Uint8Array(),
        proofWaterSig: new Uint8Array(),
        proofWaterRand: new Uint8Array(),
        proofWaterSid: new Uint8Array(),
        unusualDeviceCheckSig: new Uint8Array(),
        ...fields,
      });
      if (runtime.getQQLoginStatus()) return { result: true, message: 'QQ 已登录' };
      if (attempt !== current) return { result: false, message: '登录请求已结束' };
      if (res.result === '140022008') {
        runtime.setLoginAttempt({ id: current.id, proofWaterUrl: res.loginErrorInfo?.proofWaterUrl });
        runtime.setQQLoginPhase('captcha_required');
        return { result: true, message: '请在 WebUI 完成验证码' };
      }
      if (res.result === '140022010' || res.result === '140022011') {
        current.deviceSignature = res.loginErrorInfo?.newDevicePullQrCodeSig;
        runtime.setLoginAttempt({ id: current.id, jumpUrl: res.loginErrorInfo?.jumpUrl });
        runtime.setQQLoginPhase('device_verification');
        return { result: true, message: '请在 WebUI 完成设备验证' };
      }
      if (res.result !== '0') return fail(res.loginErrorInfo?.errMsg || '密码登录失败');
      // Native acceptance is not an authenticated account or an initialized Core.
      runtime.setLoginAttempt({ id: current.id });
      return { result: true, message: '已提交登录，等待 QQ 确认' };
    } catch {
      return attempt === current ? fail('密码登录请求失败') : { result: false, message: '登录请求已结束' };
    }
  };
  const start = async (method: 'auto' | 'qr') => {
    if (runtime.getQQLoginStatus()) return { result: true, message: '账号已登录' };
    if (runtime.getOneBotContext() || (runtime.getQQSessionExpiredReason() && service.getMsfStatus() === 2)) {
      return runtime.requestRestartProcess({ loginMethod: method });
    }
    if (method === 'auto' && attempt && !['offline', 'qrcode_failed'].includes(runtime.getQQLoginPhase())) return { result: true, message: '登录正在进行，请继续完成当前验证' };
    clear();
    runtime.setAccountReason(undefined, '');
    runtime.setQQLoginQrcodeURL('');
    attempt = { id: randomUUID() };
    runtime.setLoginAttempt({ id: attempt.id });
    if (method === 'qr') {
      runtime.setQQLoginPhase('generating_qrcode');
      return requestQR() ? { result: true, message: '请扫码登录配置中的账号' } : fail('QQ 未接受二维码请求');
    }
    const current = attempt;
    deadline = setTimeout(() => { if (attempt === current) fail('登录等待超时，请重新登录'); }, 180_000);
    deadline.unref();
    runtime.setQQLoginPhase('logging_in');
    if (hasSavedAccount) {
      const result = await quick.start(account.id);
      if (runtime.getQQLoginStatus()) return { result: true, message: 'QQ 已登录' };
      if (attempt !== current || result.cancelled) return { result: false, message: '登录请求已结束' };
      if (result.result || result.needPhoneConfirm) return { result: true, message: result.needPhoneConfirm ? '请在手机 QQ 确认' : '等待 QQ 登录成功' };
    }
    current.passwordMd5 = (account.password ? createHash('md5').update(account.password).digest('hex') : undefined);
    if (current.passwordMd5) return await password(0);
    clearTimeout(deadline);
    runtime.setQQLoginPhase('generating_qrcode');
    return requestQR() ? { result: true, message: '请扫码登录配置中的账号' } : fail('QQ 未接受二维码请求');
  };
  runtime.setAccountLoginCall(start);
  runtime.setCaptchaLoginCall(async (id, ticket, randstr, sid) => {
    if (attempt?.id !== id || runtime.getQQLoginPhase() !== 'captcha_required') return { result: false, message: '验证码已失效，请重新登录' };
    const encode = (value: string) => new TextEncoder().encode(value);
    return password(1, { proofWaterSig: encode(ticket), proofWaterRand: encode(randstr), proofWaterSid: encode(sid) });
  });
  runtime.setNewDeviceLoginCall(async (id, token) => {
    if (attempt?.id !== id || runtime.getQQLoginPhase() !== 'device_verification') return { result: false, message: '设备验证已失效，请重新登录' };
    return password(2, { newDeviceLoginSig: new TextEncoder().encode(token || attempt.deviceSignature || '') });
  });
  return { start, clear };
}
