import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const runtime = vi.hoisted(() => ({
  config: { account: { id: '12345' }, webui: { enabled: false }, onebot: {}, qqbot: { 'app-id': 'app', 'app-secret': 'secret', admins: ['admin'] } },
  createWorker: vi.fn(),
  botOptions: undefined as any,
  bot: { update: vi.fn(), workerFailed: vi.fn(), stop: vi.fn() },
}));
vi.mock('../napcat-shell/base', () => ({ NCoreInitShell: vi.fn() }));
vi.mock('@/napcat-common/src/path', () => ({ NapCatPathWrapper: class { logsPath = ''; } }));
vi.mock('@/napcat-common/src/config', () => ({ getNapigConfig: () => runtime.config, setNapigConfig: vi.fn() }));
vi.mock('@/napcat-core/helper/log', () => ({ LogWrapper: class { setFileLogEnabled () {} log () {} logWarn () {} logError () {} } }));
vi.mock('../napcat-shell/pipe', () => ({ connectToNamedPipe: async () => {} }));
vi.mock('@/napcat-webui-backend/src/helper/Data', () => ({ WebUiDataRuntime: {} }));
vi.mock('@/napcat-webui-backend/index', () => ({ webUiRuntimePort: 6099 }));
vi.mock('@/napcat-core/helper/login-diagnostics', () => ({ getLoginDiagnostics: () => ({}) }));
vi.mock('../napcat-shell/process-api', () => ({ createProcessManager: async () => ({ isElectron: false, manager: { createWorker: runtime.createWorker } }) }));
vi.mock('../napcat-shell/qqbot-management', () => ({ startQQBotManagement: (options: unknown) => { runtime.botOptions = options; return runtime.bot; } }));

class Worker extends EventEmitter {
  postMessage = vi.fn();
}
const signals = ['SIGINT', 'SIGTERM'] as const;
const existingListeners = new Set(signals.flatMap(signal => process.listeners(signal)));
afterEach(() => {
  for (const signal of signals) {
    for (const listener of process.listeners(signal)) {
      if (!existingListeners.has(listener)) process.removeListener(signal, listener);
    }
  }
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it('keeps Master alive through the crash budget, manual recovery, and cooldown retry', async () => {
  vi.useFakeTimers();
  for (const name of ['NAPCAT_WORKER_PROCESS', 'NAPCAT_DISABLE_MULTI_PROCESS', 'NAPCAT_DISABLE_MULTIPROCESSING']) vi.stubEnv(name, '0');
  vi.stubEnv('NAPCAT_DISABLE_PIPE', '1');
  let currentWorker: Worker;
  runtime.createWorker.mockImplementation(() => {
    const worker = new Worker();
    currentWorker = worker;
    queueMicrotask(() => worker.emit('spawn'));
    return worker;
  });
  await import('../napcat-shell/napcat');
  await vi.advanceTimersByTimeAsync(0);
  const crashBurst = async () => {
    for (let i = 0; i < 3; i++) {
      currentWorker.emit('exit', 7, null);
      await vi.advanceTimersByTimeAsync(0);
      expect(runtime.botOptions.getStatus().worker).toBe(i < 2 ? 'starting' : 'cooldown');
    }
    expect(runtime.bot.stop).not.toHaveBeenCalled();
  };
  await crashBurst();
  const login = runtime.botOptions.login('qr');
  await vi.advanceTimersByTimeAsync(0);
  expect(await login).toMatchObject({ result: true });
  expect(runtime.createWorker.mock.calls.at(-1)![2].env.NAPCAT_LOGIN_METHOD).toBe('qr');
  expect(runtime.botOptions.getStatus().worker).toBe('starting');
  await crashBurst();
  const creations = runtime.createWorker.mock.calls.length;
  await vi.advanceTimersByTimeAsync(599_999);
  expect(runtime.createWorker).toHaveBeenCalledTimes(creations);
  await vi.advanceTimersByTimeAsync(1);
  expect(runtime.createWorker).toHaveBeenCalledTimes(creations + 1);
  expect(runtime.botOptions.getStatus().worker).toBe('starting');
});
