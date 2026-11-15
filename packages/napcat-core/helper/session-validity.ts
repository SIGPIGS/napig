/** Only the native sendMsg authentication failure observed from QQ is classified. */
export function isSessionExpiredResult (value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const result = value as { result?: unknown; errMsg?: unknown; };
  return result.result === -10003 && typeof result.errMsg === 'string' && /\(w21\)\s*$/.test(result.errMsg);
}

/** An expired Core can only be replaced, never revived by a late online event. */
export class QQSessionValidity {
  private expiredReason = '';

  get reason (): string {
    return this.expiredReason;
  }

  isOnline (nativeOnline: boolean | undefined): boolean {
    return !this.expiredReason && nativeOnline === true;
  }

  expire (reason: string): boolean {
    if (this.expiredReason) return false;
    this.expiredReason = reason || 'QQ 登录身份已失效，请重新登录';
    return true;
  }
}
