interface AccountSwitchOptions {
  onBegin: () => Promise<void>;
  onRestarting: () => void;
  restart: () => Promise<{ result: boolean; message: string; }>;
  onError: (message: string) => void;
}

/** QQ's login service has no logout API. Replace the Worker to end its session. */
export function createAccountSwitch (options: AccountSwitchOptions) {
  let active = false;
  let pending: Promise<void> | undefined;

  const start = (): Promise<void> => {
    if (pending) return pending;
    active = true;
    pending = (async () => {
      // Master must remember the switch before the old native session exits.
      await options.onBegin();
      options.onRestarting();
      const result = await options.restart();
      if (!result.result) throw new Error(`登录服务重启失败：${result.message}`);
    })().catch(error => {
      options.onError(error instanceof Error ? error.message : '切换 QQ 账号失败');
      throw error;
    }).finally(() => {
      pending = undefined;
    });
    return pending;
  };

  // A failed restart is retried explicitly, without reviving the old account.
  return { start, isActive: () => active };
}
