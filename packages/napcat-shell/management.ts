import type { AccountState } from '@/napcat-webui-backend/src/helper/Data';

export type LoginMethod = 'auto' | 'qr';
export interface LoginResult { result: boolean; message: string; }
export type WorkerStatus = 'starting' | 'running' | 'restarting' | 'cooldown' | 'stopped';
export interface ManagedStatus {
  worker: WorkerStatus;
  account: AccountState;
}

/** There is one Worker and one login operation, so one outstanding request suffices. */
export function createLoginRequests (send: (id: number, method: LoginMethod) => void) {
  let nextId = 0;
  let pending: {
    id: number;
    promise: Promise<LoginResult>;
    resolve: (result: LoginResult) => void;
    timer: ReturnType<typeof setTimeout>;
  } | undefined;

  function finish (result: LoginResult) {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.resolve(result);
    pending = undefined;
  }

  return {
    request (method: LoginMethod): Promise<LoginResult> {
      if (pending) return pending.promise;
      const id = ++nextId;
      let complete!: (result: LoginResult) => void;
      const promise = new Promise<LoginResult>(resolve => { complete = resolve; });
      pending = {
        id,
        promise,
        resolve: complete,
        timer: setTimeout(() => finish({ result: false, message: '登录请求响应超时，请查询状态后再操作' }), 15_000),
      };
      try {
        send(id, method);
      } catch (error) {
        finish({ result: false, message: error instanceof Error ? error.message : '无法发送登录请求' });
      }
      return promise;
    },
    receive (id: number, result: LoginResult) {
      if (pending?.id === id) finish(result);
    },
    workerExited () {
      finish({ result: false, message: '登录服务已重启，请查询当前状态' });
    },
  };
}

/** Collapse repeated native callbacks into one outage and one recovery. */
export function createAccountNotifications (notify: (message: string) => void, loginUrl: string) {
  let fault = false;
  let lastPrompt = '';
  let offlineTimer: ReturnType<typeof setTimeout> | undefined;
  let latest: AccountState;
  const loginHint = loginUrl ? `\n登录页面：${loginUrl}` : '\n请通过本机 WebUI 完成人工验证；WebUI 关闭时需先启用并配置 public-url。';
  const clearOffline = () => { clearTimeout(offlineTimer); offlineTimer = undefined; };
  const alert = (account: string, reason: string) => {
    if (fault) return;
    fault = true;
    notify(`QQ ${account} 已离线：${reason}${loginHint}`);
  };
  return {
    update (state: AccountState) {
      latest = state;
      if (state.phase === 'ready') {
        clearOffline();
        lastPrompt = '';
        if (fault) notify(`QQ ${state.account} 已恢复在线`);
        fault = false;
        return;
      }
      if (state.reasonKind === 'self_offline') {
        if (!fault && !offlineTimer) {
          offlineTimer = setTimeout(() => {
            offlineTimer = undefined;
            alert(latest.account, '持续离线超过 60 秒');
          }, 60_000);
        }
      } else if (state.reasonKind === 'kicked' || state.reasonKind === 'session_expired') {
        clearOffline();
        alert(state.account, state.reason || (state.reasonKind === 'kicked' ? '账号被踢下线' : '登录身份失效'));
      }
      const prompts: Record<string, string> = {
        waiting_qrcode: '需要扫码登录',
        waiting_phone_confirm: '需要手机确认登录',
        captcha_required: '需要完成验证码',
        device_verification: '需要完成新设备验证',
        qrcode_failed: '扫码登录失败',
      };
      const prompt = prompts[state.phase] || (state.reasonKind === 'login_failed' || state.reasonKind === 'account_mismatch' ? state.reason : '');
      if (prompt) {
        const key = `${state.attemptId || ''}:${prompt}`;
        if (key !== lastPrompt) {
          lastPrompt = key;
          notify(`QQ ${state.account}：${prompt}${loginHint}`);
        }
      }
    },
    workerFailed (account: string, reason: string) {
      clearOffline();
      alert(account, reason);
    },
    stop () { clearOffline(); },
  };
}
