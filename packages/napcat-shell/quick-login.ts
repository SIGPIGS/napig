interface NativeQuickLoginResult {
  result: string;
  loginErrorInfo?: { errMsg?: string; step?: number; };
}

export interface QuickLoginOutcome {
  result: boolean;
  message: string;
  needPhoneConfirm?: boolean;
  cancelled?: boolean;
}

interface QuickLoginOptions {
  login: (uin: string) => Promise<NativeQuickLoginResult>;
  onResponse: (result: NativeQuickLoginResult) => void;
  onWaiting: () => void;
  onSuccess: () => void;
  onBackgroundFailure: (message: string) => void;
  confirmationTimeoutMs?: number;
}

/** Keep phone verification separate from QR login and bound its lifetime. */
export function createQuickLoginFlow (options: QuickLoginOptions) {
  let generation = 0;
  let waitingUin: string | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    generation++;
    waitingUin = undefined;
    clearTimeout(deadlineTimer);
  };

  const start = async (uin: string): Promise<QuickLoginOutcome> => {
    if (waitingUin === uin) return { result: false, message: '', needPhoneConfirm: true };
    cancel();
    const attempt = generation;
    const isCurrent = () => generation === attempt;
    const failure = (message: string): QuickLoginOutcome => ({ result: false, message });

    const run = async (): Promise<QuickLoginOutcome> => {
      const response = await options.login(uin);
      if (!isCurrent()) return { result: false, message: '', cancelled: true };
      options.onResponse(response);
      if (response.result === '0' && !response.loginErrorInfo?.errMsg) {
        cancel();
        options.onSuccess();
        return { result: true, message: '' };
      }
      if (response.result !== '4') {
        const message = response.loginErrorInfo?.errMsg || `快速登录失败，错误码: ${response.result}`;
        cancel();
        return failure(message);
      }

      if (!waitingUin) {
        waitingUin = uin;
        options.onWaiting();
        deadlineTimer = setTimeout(() => {
          if (!isCurrent()) return;
          cancel();
          options.onBackgroundFailure('手机确认已超时，请重新登录');
        }, options.confirmationTimeoutMs ?? 180_000);
        deadlineTimer.unref();
      }
      return { result: false, message: '', needPhoneConfirm: true };
    };

    try {
      return await run();
    } catch (error) {
      if (!isCurrent()) return { result: false, message: '', cancelled: true };
      cancel();
      return failure(error instanceof Error ? error.message : '快速登录发生错误');
    }
  };

  return { start, cancel, isWaiting: () => waitingUin !== undefined };
}
