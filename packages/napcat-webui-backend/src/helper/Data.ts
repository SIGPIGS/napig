import { getNapigConfig } from 'napcat-common/src/config';
import { napCatVersion } from 'napcat-common/src/version';
import { NapCatCoreWorkingEnv, type LoginRuntimeType, type QQLoginPhase, type RestartProcessOptions } from '../types';

let sessionExpiredReason = process.env['NAPCAT_SESSION_EXPIRED_REASON'] || '';

const LoginRuntime: LoginRuntimeType = {
  workingEnv: NapCatCoreWorkingEnv.Unknown,
  QQLoginStatus: false, // 已实现 但太傻了 得去那边注册个回调刷新
  QQLoginPhase: 'reconnecting',
  QQQRCodeURL: '',
  QQLoginUin: '',
  QQLoginInfo: {
    uid: '',
    uin: '',
    nick: '',
  },
  QQLoginError: '',
  QQVersion: 'unknown',
  QQDataPath: '',
  OneBotContext: null,
  onQQLoginStatusChange: async (status: boolean) => {
    LoginRuntime.QQLoginStatus = status;
    notify();
  },
  onRefreshQRCode: async () => {
    throw new Error('QQ 登录服务尚未初始化，请稍后重试');
  },
  NapCatHelper: {
    onRestartProcessRequested: async () => {
      return { result: false, message: '重启功能未初始化' };
    },
  },
  NapCatVersion: napCatVersion,
};

export interface LoginAttemptView {
  id: string;
  proofWaterUrl?: string;
  jumpUrl?: string;
}
export interface AccountState {
  account: string;
  phase: QQLoginPhase;
  reason: string;
  reasonKind?: 'kicked' | 'session_expired' | 'self_offline' | 'login_failed' | 'account_mismatch';
  attemptId?: string;
}
type LoginResult = { result: boolean; message: string };
let attempt: LoginAttemptView | undefined;
let reasonKind: AccountState['reasonKind'];
const listeners = new Set<(state: AccountState) => void>();
let notificationPending = false;
function notify () {
  if (notificationPending) return;
  notificationPending = true;
  queueMicrotask(() => {
    notificationPending = false;
    const state = WebUiDataRuntime.getAccountState();
    for (const listener of listeners) listener(state);
  });
}
let loginCall: (method: 'auto' | 'qr') => Promise<LoginResult> = async () => ({ result: false, message: 'QQ 登录服务尚未就绪' });
let captchaCall: (id: string, ticket: string, randstr: string, sid: string) => Promise<LoginResult> = async () => ({ result: false, message: '登录已失效' });
let deviceCall: (id: string, token: string) => Promise<LoginResult> = async () => ({ result: false, message: '登录已失效' });

export const WebUiDataRuntime = {
  getAccountState (): AccountState {
    return { account: getNapigConfig().account.id, phase: LoginRuntime.QQLoginPhase, reason: LoginRuntime.QQLoginError || sessionExpiredReason, reasonKind, attemptId: attempt?.id };
  },
  subscribeAccountState (listener: (state: AccountState) => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  setAccountReason (kind: AccountState['reasonKind'], reason: string) {
    reasonKind = kind;
    LoginRuntime.QQLoginError = reason;
    notify();
  },
  getLoginAttempt: () => attempt,
  setLoginAttempt (value: LoginAttemptView | undefined) { attempt = value; notify(); },
  setAccountLoginCall (callback: typeof loginCall) { loginCall = callback; },
  requestAccountLogin (method: 'auto' | 'qr') { return loginCall(method); },
  setCaptchaLoginCall (callback: typeof captchaCall) { captchaCall = callback; },
  requestCaptchaLogin (id: string, ticket: string, randstr: string, sid: string) { return captchaCall(id, ticket, randstr, sid); },
  setNewDeviceLoginCall (callback: typeof deviceCall) { deviceCall = callback; },
  requestNewDeviceLogin (id: string, token: string) { return deviceCall(id, token); },

  getQQSessionExpiredReason (): string {
    return sessionExpiredReason;
  },

  setQQSessionExpiredReason (reason: string): void {
    sessionExpiredReason = reason;
    notify();
  },

  setWorkingEnv (env: NapCatCoreWorkingEnv): void {
    LoginRuntime.workingEnv = env;
  },
  getWorkingEnv (): NapCatCoreWorkingEnv {
    return LoginRuntime.workingEnv;
  },
  getQQLoginStatus (): LoginRuntimeType['QQLoginStatus'] {
    return LoginRuntime.QQLoginStatus;
  },

  setQQLoginCallback (func: (status: boolean) => Promise<void>): void {
    LoginRuntime.onQQLoginStatusChange = func;
  },

  getQQLoginCallback (): (status: boolean) => Promise<void> {
    return LoginRuntime.onQQLoginStatusChange;
  },

  setQQLoginStatus (status: LoginRuntimeType['QQLoginStatus']): void {
    LoginRuntime.QQLoginStatus = status;
    notify();
  },

  setQQLoginPhase (phase: QQLoginPhase): void {
    LoginRuntime.QQLoginPhase = phase;
    notify();
  },

  getQQLoginPhase (): QQLoginPhase {
    return LoginRuntime.QQLoginPhase;
  },

  setQQLoginQrcodeURL (url: LoginRuntimeType['QQQRCodeURL']): void {
    LoginRuntime.QQQRCodeURL = url;
  },

  getQQLoginQrcodeURL (): LoginRuntimeType['QQQRCodeURL'] {
    return LoginRuntime.QQQRCodeURL;
  },

  setQQLoginInfo (info: LoginRuntimeType['QQLoginInfo']): void {
    LoginRuntime.QQLoginInfo = info;
    LoginRuntime.QQLoginUin = info.uin.toString();
  },

  getQQLoginInfo (): LoginRuntimeType['QQLoginInfo'] {
    return LoginRuntime.QQLoginInfo;
  },

  getQQLoginUin (): LoginRuntimeType['QQLoginUin'] {
    return LoginRuntime.QQLoginUin;
  },

  GetNapCatVersion () {
    return LoginRuntime.NapCatVersion;
  },

  setQQVersion (version: string) {
    LoginRuntime.QQVersion = version;
  },

  getQQVersion () {
    return LoginRuntime.QQVersion;
  },

  setQQDataPath (dataPath: string) {
    LoginRuntime.QQDataPath = dataPath;
  },

  getQQDataPath (): string {
    return LoginRuntime.QQDataPath;
  },

  setOneBotContext (context: any): void {
    LoginRuntime.OneBotContext = context;
  },

  getOneBotContext (): any | null {
    return LoginRuntime.OneBotContext;
  },

  setRestartProcessCall (func: (options?: RestartProcessOptions) => Promise<{ result: boolean; message: string; }>): void {
    LoginRuntime.NapCatHelper.onRestartProcessRequested = func;
  },

  requestRestartProcess: async function (options?: RestartProcessOptions) {
    return await LoginRuntime.NapCatHelper.onRestartProcessRequested(options);
  },

  setQQLoginError (error: string): void {
    LoginRuntime.QQLoginError = error;
    notify();
  },

  getQQLoginError (): string {
    return LoginRuntime.QQLoginError;
  },

  setRefreshQRCodeCallback (func: () => Promise<void>): void {
    LoginRuntime.onRefreshQRCode = func;
  },

  getRefreshQRCodeCallback (): () => Promise<void> {
    return LoginRuntime.onRefreshQRCode;
  },

  refreshQRCode: async function () {
    const previousQRCodeUrl = LoginRuntime.QQQRCodeURL;
    const previousPhase = LoginRuntime.QQLoginPhase;
    LoginRuntime.QQLoginError = '';
    LoginRuntime.QQLoginPhase = 'generating_qrcode';
    try {
      await LoginRuntime.onRefreshQRCode();
    } catch (error) {
      if (LoginRuntime.QQLoginPhase === 'generating_qrcode') {
        LoginRuntime.QQLoginPhase = previousPhase;
      }
      LoginRuntime.QQLoginError = (error as Error).message;
      throw error;
    }

    const refreshTimeout = 10_000;
    const deadline = Date.now() + refreshTimeout;
    while (Date.now() < deadline) {
      const qrcodeUrl = LoginRuntime.QQQRCodeURL;
      if (qrcodeUrl && qrcodeUrl !== previousQRCodeUrl) {
        LoginRuntime.QQLoginPhase = 'waiting_qrcode';
        return qrcodeUrl;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    LoginRuntime.QQLoginPhase = previousQRCodeUrl ? 'waiting_qrcode' : 'offline';
    throw new Error('二维码刷新超时：QQ 登录服务未返回新的二维码');
  },
};
