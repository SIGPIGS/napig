import { NCoreInitShell } from './base';
import { NapCatPathWrapper } from '@/napcat-common/src/path';
import { getNapigConfig, setNapigConfig, type NapigConfig } from '@/napcat-common/src/config';
import { LogWrapper } from '@/napcat-core/helper/log';
import { connectToNamedPipe } from './pipe';
import { WebUiDataRuntime, type AccountState } from '@/napcat-webui-backend/src/helper/Data';
import { webUiRuntimePort } from '@/napcat-webui-backend/index';
import { createSessionRecoveryBudget } from './session-recovery';
import { getLoginDiagnostics } from '@/napcat-core/helper/login-diagnostics';
import { createProcessManager, type IProcessManager, type IWorkerProcess } from './process-api';
import { createLoginRequests, type LoginMethod, type LoginResult, type ManagedStatus } from './management';
import { startQQBotManagement } from './qqbot-management';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const pathWrapper = new NapCatPathWrapper();
const ENV = {
  isWorkerProcess: process.env['NAPCAT_WORKER_PROCESS'] === '1',
  isMultiProcessDisabled: process.env['NAPCAT_DISABLE_MULTI_PROCESS'] === '1' || process.env['NAPCAT_DISABLE_MULTIPROCESSING'] === '1',
  isPipeDisabled: process.env['NAPCAT_DISABLE_PIPE'] === '1',
};
const logger = new LogWrapper(pathWrapper.logsPath);
if (!ENV.isWorkerProcess && !ENV.isMultiProcessDisabled) logger.setFileLogEnabled(false);

type WorkerMessage =
  | { type: 'worker-started'; }
  | { type: 'configure'; config: NapigConfig; }
  | { type: 'restart'; port?: number; sessionExpiredReason?: string; loginMethod?: LoginMethod; }
  | { type: 'restart-prepare' | 'shutdown' | 'login-success'; }
  | { type: 'account-state'; state: AccountState; }
  | { type: 'login'; id: number; method: LoginMethod; }
  | { type: 'login-result'; id: number; result: LoginResult; };

let processManager: IProcessManager;
let currentWorker: IWorkerProcess | undefined;
let isElectron = false;
let isRestarting = false;
let isShuttingDown = false;
let sessionExpiredReason = process.env['NAPCAT_SESSION_EXPIRED_REASON'] || '';
let allowRecoveryQuickLogin = false;
const requestAutomaticRecovery = createSessionRecoveryBudget();
const crashTimes: number[] = [];
let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
let management: ReturnType<typeof startQQBotManagement> | undefined;
let status: ManagedStatus;
const loginRequests = createLoginRequests((id, method) => {
  if (!currentWorker) throw new Error('QQ Worker 尚未启动');
  currentWorker.postMessage({ type: 'login', id, method } satisfies WorkerMessage);
});

function forceStopWorker (child: IWorkerProcess) {
  // Native calls can block the Worker's event loop, including SIGTERM handlers.
  if (child.pid) {
    try { process.kill(child.pid, 'SIGKILL'); } catch (error) { logger.logWarn('[NapCat] 终止 Worker 失败:', error); }
  }
}

function scheduleRecovery () {
  clearTimeout(recoveryTimer);
  status.worker = 'cooldown';
  logger.logError('[NapCat] Worker 连续启动失败，10 分钟后重试；官方机器人仍可用于手动恢复');
  recoveryTimer = setTimeout(() => {
    recoveryTimer = undefined;
    crashTimes.length = 0;
    startWorker().catch(error => {
      logger.logError('[NapCat] Worker 恢复失败:', error);
      scheduleRecovery();
    });
  }, 10 * 60_000);
}

/** A stopped Worker cannot keep serving stale status or resolve an old login command. */
function workerExited (child: IWorkerProcess, code: unknown, signal: unknown) {
  if (currentWorker !== child) return;
  currentWorker = undefined;
  loginRequests.workerExited();
  status.worker = isRestarting ? 'restarting' : 'stopped';
  status.account = { ...status.account, phase: 'offline' };
  logger.logWarn('[NapCat] Worker 退出', { pid: child.pid, code, signal, isRestarting, isShuttingDown });
  if (isRestarting || isShuttingDown) return;
  management?.workerFailed(status.account.account, `QQ Worker 意外退出 (${String(code ?? signal)})`);
  const now = Date.now();
  crashTimes.push(now);
  while (crashTimes[0]! < now - 10_000) crashTimes.shift();
  if (crashTimes.length >= 3) { scheduleRecovery(); return; }
  startWorker().catch(error => {
    logger.logError('[NapCat] Worker 启动失败:', error);
    scheduleRecovery();
  });
}

/** Replace only the Native Worker; the official bot remains connected in Master. */
export async function restartWorker (port?: number, expiredReason?: string, method?: LoginMethod): Promise<void> {
  if (expiredReason && !sessionExpiredReason) {
    sessionExpiredReason = expiredReason;
    allowRecoveryQuickLogin = requestAutomaticRecovery();
  }
  if (isRestarting) return;
  isRestarting = true;
  clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
  status.worker = 'restarting';
  try {
    const child = currentWorker;
    if (child) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => forceStopWorker(child), 5_000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.postMessage({ type: 'restart-prepare' } satisfies WorkerMessage);
      });
    }
    await startWorker(port, method);
  } finally {
    isRestarting = false;
  }
}

async function startWorker (preferredPort?: number, method?: LoginMethod): Promise<void> {
  const config = getNapigConfig();
  const { qqbot: _qqbot, ...workerConfig } = config;
  // A manual login is explicit permission to try again; automatic session recovery
  // consumes the existing budget once when the replacement Worker is created.
  if (method) sessionExpiredReason = '';
  const recoveryQuickLogin = !!sessionExpiredReason && allowRecoveryQuickLogin;
  const workerScript = __filename.endsWith('.mjs')
    ? path.join(path.dirname(__filename), 'napcat.mjs')
    : path.join(path.dirname(__filename), 'napcat.js');
  const child = processManager.createWorker(workerScript, [], {
    env: {
      ...process.env,
      NAPCAT_WORKER_PROCESS: '1',
      NAPCAT_SESSION_EXPIRED_REASON: sessionExpiredReason,
      NAPCAT_RECOVERY_QUICK_LOGIN: recoveryQuickLogin ? '1' : '0',
      NAPCAT_LOGIN_METHOD: method || 'auto',
      ...(preferredPort ? { NAPCAT_WEBUI_PREFERRED_PORT: String(preferredPort) } : {}),
    },
    stdio: isElectron ? 'pipe' : ['inherit', 'pipe', 'pipe', 'ipc'],
  });
  allowRecoveryQuickLogin = false;
  currentWorker = child;
  status.worker = 'starting';
  status.account = { ...status.account, phase: 'reconnecting' };
  child.stdout?.on('data', (data: Buffer) => process.stdout.write(data));
  child.stderr?.on('data', (data: Buffer) => process.stderr.write(data));
  child.on('message', (raw: unknown) => {
    if (currentWorker !== child) return;
    const message = raw as WorkerMessage;
    switch (message.type) {
      case 'worker-started':
        child.postMessage({ type: 'configure', config: workerConfig } satisfies WorkerMessage);
        break;
      case 'account-state':
        status.worker = 'running';
        status.account = message.state;
        management?.update(message.state);
        break;
      case 'login-result':
        loginRequests.receive(message.id, message.result);
        break;
      case 'restart':
        restartWorker(message.port, message.sessionExpiredReason, message.loginMethod).catch(error => {
          logger.logError('[NapCat] Worker 重启失败:', error);
          management?.workerFailed(config.account.id, 'QQ Worker 重启失败');
          scheduleRecovery();
        });
        break;
      case 'login-success':
        sessionExpiredReason = '';
        logger.log('[NapCat] QQ Worker 已登录', { ...getLoginDiagnostics(), workerPid: child.pid });
        break;
    }
  });
  child.on('exit', (code, signal) => workerExited(child, code, signal));
  child.on('error', error => logger.logError('[NapCat] Worker 进程错误:', error));
  await new Promise<void>((resolve, reject) => {
    const onError = (error: unknown) => {
      if (currentWorker === child) {
        currentWorker = undefined;
        status.worker = 'stopped';
        loginRequests.workerExited();
      }
      reject(error);
    };
    child.once('spawn', () => { child.off('error', onError); resolve(); });
    child.once('error', onError);
  });
}

async function login (method: LoginMethod): Promise<LoginResult> {
  if (status.account.phase === 'ready') return { result: true, message: '账号已经在线' };
  if (isRestarting) return { result: false, message: 'QQ Worker 正在重启，请稍后重试' };
  if (!currentWorker) {
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
    crashTimes.length = 0;
    await restartWorker(undefined, undefined, method);
    return { result: true, message: '已启动 QQ Worker，正在准备登录' };
  }
  return loginRequests.request(method);
}

async function startMasterProcess (): Promise<void> {
  const config = getNapigConfig();
  status = { worker: 'starting', account: { account: config.account.id, phase: 'reconnecting', reason: '' } };
  if (config.qqbot) {
    management = startQQBotManagement({
      config: config.qqbot,
      publicUrl: config.webui.enabled ? config.webui['public-url'] : undefined,
      getStatus: () => status,
      login,
      log: message => logger.logWarn(message),
    });
  }
  if (!ENV.isPipeDisabled) {
    await connectToNamedPipe(logger).catch(error => logger.logError('命名管道连接失败', error));
  }
  const shutdown = () => {
    isShuttingDown = true;
    clearTimeout(recoveryTimer);
    management?.stop();
    const child = currentWorker;
    if (!child) { process.exit(0); return; }
    child.once('exit', () => process.exit(0));
    child.postMessage({ type: 'shutdown' } satisfies WorkerMessage);
    setTimeout(() => forceStopWorker(child), 1_000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await startWorker().catch(error => {
    logger.logError('[NapCat] Worker 启动失败:', error);
    management?.workerFailed(config.account.id, 'QQ Worker 启动失败');
    scheduleRecovery();
  });
}

async function startWorkerProcess (): Promise<void> {
  let configure!: (config: NapigConfig) => void;
  const configured = new Promise<NapigConfig>(resolve => { configure = resolve; });
  processManager.onParentMessage((raw: unknown) => {
    const message = raw as WorkerMessage;
    if (message.type === 'configure') configure(message.config);
    if (message.type === 'restart-prepare' || message.type === 'shutdown') process.exit(0);
    if (message.type === 'login') {
      WebUiDataRuntime.requestAccountLogin(message.method).then(result => {
        processManager.sendToParent({ type: 'login-result', id: message.id, result } satisfies WorkerMessage);
      }, error => {
        processManager.sendToParent({ type: 'login-result', id: message.id, result: { result: false, message: error instanceof Error ? error.message : '登录请求失败' } } satisfies WorkerMessage);
      });
    }
  });
  processManager.sendToParent({ type: 'worker-started' } satisfies WorkerMessage);
  setNapigConfig(await configured);
  const preloadAddonPath = process.env['NAPCAT_PRELOAD_NODE_ADDON_PATH'];
  if (preloadAddonPath) {
    const os = await import('node:os');
    process.dlopen({ exports: {} }, preloadAddonPath, os.constants.dlopen.RTLD_NOW | os.constants.dlopen.RTLD_GLOBAL);
  }
  WebUiDataRuntime.subscribeAccountState(state => {
    processManager.sendToParent({ type: 'account-state', state } satisfies WorkerMessage);
  });
  WebUiDataRuntime.setRestartProcessCall(async options => {
    const sent = processManager.sendToParent({
      type: 'restart',
      port: webUiRuntimePort,
      sessionExpiredReason: options?.sessionExpiredReason,
      loginMethod: options?.loginMethod,
    } satisfies WorkerMessage);
    return { result: sent, message: sent ? '进程重启请求已发送' : '无法与主进程通信' };
  });
  await NCoreInitShell();
  if (!WebUiDataRuntime.getQQSessionExpiredReason()) processManager.sendToParent({ type: 'login-success' } satisfies WorkerMessage);
}

async function main (): Promise<void> {
  if (ENV.isMultiProcessDisabled) {
    if (getNapigConfig().qqbot) throw new Error('官方机器人管理通道需要 Shell 多进程模式');
    await NCoreInitShell();
    return;
  }
  const result = await createProcessManager();
  processManager = result.manager;
  isElectron = result.isElectron;
  if (ENV.isWorkerProcess) await startWorkerProcess();
  else await startMasterProcess();
}

main().catch(error => {
  logger.logError('[NapCat] 启动失败:', error);
  process.exit(1);
});
