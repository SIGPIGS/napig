import { describe, expect, it } from 'vitest';
import { isSessionExpiredResult, QQSessionValidity } from './session-validity';

describe('QQ session validity', () => {
  it('only recognizes the observed native authentication error', () => {
    expect(isSessionExpiredResult({ result: -10003, errMsg: '身份验证失败，请你重新登录。(w21)' })).toBe(true);
    for (const result of [null, {}, { result: -10003, errMsg: '请求超时' }, { result: -1, errMsg: '(w21)' }]) {
      expect(isSessionExpiredResult(result)).toBe(false);
    }
  });

  it('locks the first expiry and rejects late online signals until a new session', () => {
    const session = new QQSessionValidity();
    expect(session.isOnline(true)).toBe(true);
    expect(session.expire('身份失效')).toBe(true);
    expect(session.expire('重复失效')).toBe(false);
    expect(session.reason).toBe('身份失效');
    expect(session.isOnline(true)).toBe(false);
    expect(session.isOnline(false)).toBe(false);
    expect(new QQSessionValidity().isOnline(true)).toBe(true);
  });
});
