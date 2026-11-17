import { QQBot, type QQBotInboundMessage } from '@tencent-connect/qqbot-nodejs';
import type { NapigConfig } from '@/napcat-common/src/config';
import { createAccountNotifications, type LoginMethod, type LoginResult, type ManagedStatus } from './management';

interface Options {
  config: NonNullable<NapigConfig['qqbot']>;
  publicUrl: string | undefined;
  getStatus: () => ManagedStatus;
  login: (method: LoginMethod) => Promise<LoginResult>;
  log: (message: string) => void;
}

const help = '/status 查看账号状态\n/login 发起登录\n/login qr 扫码登录\n/whoami 查看自己的 OpenID';

/** SDK reconnects while running; only a rejected run is started again here. */
export function startQQBotManagement ({ config, publicUrl, getStatus, login, log }: Options) {
  const bot = new QQBot({
    appId: config['app-id'],
    appSecret: config['app-secret'],
    baseUrl: 'https://api.bot.qq.com',
    tokenBaseUrl: 'https://api.bot.qq.com',
    intents: 1 << 25,
    markdownSupport: false,
  });
  const loginUrl = publicUrl ? `${publicUrl}/webui/qq_login` : '';
  const loginHint = loginUrl ? `\n登录页面：${loginUrl}` : '\n登录页面未对外配置，请通过本机 WebUI 完成人工验证；WebUI 关闭时需先启用。';
  const admins = new Set(config.admins);
  const seen = new Set<string>();
  let connection = 'connecting';
  let queued: string | undefined;
  let stopped = false;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  const reportError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`[QQBot] ${message.replaceAll(config['app-secret'], '[redacted]')}`);
  };
  async function deliver (message: string) {
    await Promise.all([...admins].map(async targetId => {
      try {
        await bot.sendText({ scope: 'c2c', targetId }, message);
      } catch (error) {
        reportError(error);
      }
    }));
  }
  function notify (message: string) {
    if (connection !== 'ready') {
      queued = message;
      return;
    }
    deliver(message);
  }
  const notifications = createAccountNotifications(notify, loginUrl);
  const onReady = () => {
    connection = 'ready';
    log('[QQBot] 官方机器人管理通道已连接');
    if (queued) {
      const message = queued;
      queued = undefined;
      deliver(message);
    }
  };
  bot.on('ready', onReady);
  bot.on('resumed', onReady);
  bot.on('disconnected', () => { connection = 'disconnected'; });
  bot.on('error', reportError);
  bot.on('message', async (_ctx, message) => {
    try { await handleMessage(message); } catch (error) { reportError(error); }
  });

  async function handleMessage (message: QQBotInboundMessage) {
    if (message.replyTarget.scope !== 'c2c') return;
    if (seen.has(message.messageId)) return;
    seen.add(message.messageId);
    if (seen.size > 256) seen.delete(seen.values().next().value!);
    const command = message.content.trim();
    const reply = (text: string) => bot.sendText(message.replyTarget, text);
    if (command === '/whoami') { await reply(`你的 user_openid：${message.senderId}`); return; }
    if (!admins.has(message.senderId)) return;
    if (command === '/help') { await reply(help); return; }
    if (command === '/status') {
      const state = getStatus();
      await reply(`QQ：${state.account.account}\n登录状态：${state.account.phase}\nWorker：${state.worker}\n管理通道：${connection}${state.account.reason ? `\n原因：${state.account.reason}` : ''}`);
      return;
    }
    if (command === '/login' || command === '/login qr') {
      const result = await login(command === '/login qr' ? 'qr' : 'auto');
      await reply(`${result.result ? '已受理' : '未执行'}：${result.message}${loginHint}`);
      return;
    }
    await reply(help);
  }

  function start () {
    connection = 'connecting';
    bot.start().catch((error: unknown) => {
      if (stopped) return;
      connection = 'failed';
      reportError(error);
      // A banned/offline application requires operator action. The SDK has
      // already exhausted its run and released its own reconnect resources.
      if ((error as { code?: string; })?.code === 'GATEWAY_FATAL_CLOSE') return;
      const delay = 60_000;
      log(`[QQBot] 管理通道启动失败，${delay / 1000} 秒后重试`);
      restartTimer = setTimeout(start, delay);
    });
  }
  start();
  return {
    update: notifications.update,
    workerFailed: notifications.workerFailed,
    getConnectionStatus: () => connection,
    stop () { stopped = true; clearTimeout(restartTimer); notifications.stop(); bot.stop(); connection = 'stopped'; },
  };
}
