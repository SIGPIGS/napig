/**
 * @file WebUI服务入口文件
 */

import express from 'express';
import type { WebUiConfigType } from './src/types';
import { createServer, STATUS_CODES } from 'http';
import { createHash } from 'node:crypto';
import { createServer as createHttpsServer } from 'https';
import { NapCatPathWrapper } from 'napcat-common/src/path';
import { WebUiConfigWrapper } from '@/napcat-webui-backend/src/helper/config';
import { ALLRouter } from '@/napcat-webui-backend/src/router';
import { cors } from '@/napcat-webui-backend/src/middleware/cors';
import { configureExternalAuth, externalAuthError } from './src/helper/ExternalAuth';
import { auth } from './src/middleware/auth';
import { sendError } from '@/napcat-webui-backend/src/utils/response';
import { join, dirname, resolve } from 'node:path';
import multer from 'multer';
import * as net from 'node:net';
import { WebUiDataRuntime } from './src/helper/Data';
import { existsSync, readFileSync } from 'node:fs'; // 引入multer用于错误捕获
import { ILogWrapper } from 'napcat-common/src/log-interface';
import { ISubscription } from 'napcat-common/src/subscription-interface';
import { IStatusHelperSubscription } from '@/napcat-common/src/status-interface';
import { handleDebugWebSocket } from '@/napcat-webui-backend/src/api/Debug';
import compression from 'compression';
import { napCatVersion } from 'napcat-common/src/version';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 实例化Express
const app = express();
/**
 * 初始化并启动WebUI服务。
 * 该函数配置了Express服务器以支持JSON解析和静态文件服务，并监听6099端口。
 * 无需参数。
 * @returns {Promise<void>} 无返回值。
 */
export let WebUiConfig: WebUiConfigWrapper;
export let webUiPathWrapper: NapCatPathWrapper;
export let logSubscription: ISubscription;
export let statusHelperSubscription: IStatusHelperSubscription;
export let webUiLogger: ILogWrapper | null = null;
const MAX_PORT_TRY = 100;

export let webUiRuntimePort = 6099;
export async function InitPort (parsedConfig: WebUiConfigType): Promise<[string, number]> {
  try {
    await tryUseHost(parsedConfig.host);
    const preferredPort = parseInt(process.env['NAPCAT_WEBUI_PREFERRED_PORT'] || '', 10);

    let port: number;
    if (preferredPort > 0) {
      try {
        port = await tryUsePort(preferredPort, parsedConfig.host, 0, true);
      } catch {
        port = await tryUsePort(parsedConfig.port, parsedConfig.host);
      }
    } else {
      port = await tryUsePort(parsedConfig.port, parsedConfig.host);
    }

    return [parsedConfig.host, port];
  } catch (error) {
    console.log('host或port不可用', error);
    return ['', 0];
  }
}

async function checkCertificates (logger: ILogWrapper): Promise<{ key: string, cert: string; } | null> {
  try {
    const certPath = join(webUiPathWrapper.configPath, 'cert.pem');
    const keyPath = join(webUiPathWrapper.configPath, 'key.pem');

    if (existsSync(certPath) && existsSync(keyPath)) {
      const cert = readFileSync(certPath, 'utf8');
      const key = readFileSync(keyPath, 'utf8');
      logger.log('[NapCat] [WebUi] 找到SSL证书，将启用HTTPS模式');
      return { cert, key };
    }
    return null;
  } catch (error) {
    logger.log('[NapCat] [WebUi] 检查SSL证书时出错: ' + error);
    return null;
  }
}
export async function InitWebUi (logger: ILogWrapper, pathWrapper: NapCatPathWrapper, Subscription: ISubscription, statusSubscription: IStatusHelperSubscription) {
  webUiPathWrapper = pathWrapper;
  logSubscription = Subscription;
  statusHelperSubscription = statusSubscription;
  webUiLogger = logger;
  WebUiConfig = new WebUiConfigWrapper();
  const config = await WebUiConfig.GetWebUIConfig();

  // 检查是否禁用 WebUI
  if (config.disableWebUI) {
    logger.log('[NapCat] [WebUi] WebUI is disabled by configuration.');
    return;
  }

  const publicOrigin = configureExternalAuth();
  const [host, port] = await InitPort(config);
  webUiRuntimePort = port;
  if (port === 0) {
    logger.log('[NapCat] [WebUi] Current WebUi is not run.');
    return;
  }
  WebUiDataRuntime.setWebUiConfigQuickFunction(
    async () => {
      if (WebUiDataRuntime.getQQSessionExpiredReason() && process.env['NAPCAT_RECOVERY_QUICK_LOGIN'] !== '1') return;
      const autoLoginAccount = process.env['NAPCAT_QUICK_ACCOUNT'] || WebUiConfig.getAutoLoginAccount();
      const resolveQuickPasswordMd5 = (): string | undefined => {
        const quickPasswordMd5FromEnv = process.env['NAPCAT_QUICK_PASSWORD_MD5']?.trim();
        if (quickPasswordMd5FromEnv) {
          if (/^[a-fA-F0-9]{32}$/.test(quickPasswordMd5FromEnv)) {
            return quickPasswordMd5FromEnv.toLowerCase();
          }
          console.log('[NapCat] [WebUi] NAPCAT_QUICK_PASSWORD_MD5 格式无效（需为 32 位 MD5）');
        }

        const quickPassword = process.env['NAPCAT_QUICK_PASSWORD'];
        if (typeof quickPassword === 'string' && quickPassword.length > 0) {
          console.log('[NapCat] [WebUi] 检测到 NAPCAT_QUICK_PASSWORD，已在内存中计算 MD5 用于回退登录');
          return createHash('md5').update(quickPassword, 'utf8').digest('hex');
        }
        return undefined;
      };
      if (!autoLoginAccount) {
        return;
      }
      const quickPasswordMd5 = resolveQuickPasswordMd5();

      try {
        const { result, message, needPhoneConfirm } = await WebUiDataRuntime.requestQuickLogin(autoLoginAccount);
        if (needPhoneConfirm) return;
        if (result) {
          console.log(`[NapCat] [WebUi] 自动快速登录成功: ${autoLoginAccount}`);
          return;
        }
        console.log(`[NapCat] [WebUi] 自动快速登录失败: ${message || '未知错误'}`);
      } catch (error) {
        console.log('[NapCat] [WebUi] 自动快速登录异常:' + error);
      }

      if (WebUiDataRuntime.getQQSessionExpiredReason()) return;
      if (!quickPasswordMd5) {
        console.log(`[NapCat] [WebUi] QQ ${autoLoginAccount} 未配置回退密码环境变量，建议优先使用 ACCOUNT + NAPCAT_QUICK_PASSWORD（NAPCAT_QUICK_PASSWORD_MD5 作为备用），保持二维码登录兜底`);
        return;
      }

      try {
        const { result, message, needCaptcha, needNewDevice } = await WebUiDataRuntime.requestPasswordLogin(autoLoginAccount, quickPasswordMd5);
        if (result) {
          console.log(`[NapCat] [WebUi] 自动密码回退登录成功: ${autoLoginAccount}`);
          return;
        }
        if (needCaptcha) {
          console.log(`[NapCat] [WebUi] 自动密码回退登录需要验证码，请在登录页面继续完成: ${autoLoginAccount}`);
          return;
        }
        if (needNewDevice) {
          console.log(`[NapCat] [WebUi] 自动密码回退登录需要新设备验证，请在登录页面继续完成: ${autoLoginAccount}`);
          return;
        }
        console.log(`[NapCat] [WebUi] 自动密码回退登录失败: ${message || '未知错误'}`);
      } catch (error) {
        console.log('[NapCat] [WebUi] 自动密码回退登录异常:' + error);
      }
    });
  // ------------注册中间件------------
  // 使用express的json中间件
  app.use(auth);
  app.use(express.json());
  // 启用gzip压缩（对所有响应启用，阈值1KB）
  app.use(compression({
    level: 6, // 压缩级别 1-9，6 是性能和压缩率的平衡点
    threshold: 1024, // 只压缩大于 1KB 的响应
    filter: (req, res) => {
      // 不压缩 SSE 和 WebSocket 升级请求
      if (req.headers['accept']?.includes('text/event-stream')) {
        return false;
      }
      // 使用默认过滤器
      return compression.filter(req, res);
    },
  }));

  // CORS中间件
  // TODO:
  app.use(cors);

  // 自定义字体文件路由 - 返回用户上传的字体文件
  app.use('/webui/fonts/CustomFont.woff', async (_req, res) => {
    const fontPath = await WebUiConfig.GetWebUIFontPath();
    if (fontPath) {
      res.sendFile(fontPath);
    } else {
      res.status(404).send('Custom font not found');
    }
  });

  // 如果是自定义色彩，构建一个css文件
  app.use('/files/theme.css', async (_req, res) => {
    const theme = await WebUiConfig.GetTheme();
    const fontMode = theme.fontMode || 'system';

    let css = '';

    // 生成字体 @font-face
    if (fontMode === 'aacute') {
      css += `
@font-face {
  font-family: 'Aa偷吃可爱长大的';
  src: url('/webui/fonts/AaCute.woff') format('woff');
  font-display: swap;
}
`;
    } else if (fontMode === 'custom') {
      css += `
@font-face {
  font-family: 'CustomFont';
  src: url('/webui/fonts/CustomFont.woff') format('woff');
  font-display: swap;
}
`;
    }

    // 生成颜色主题和字体变量
    css += ':root, .light, [data-theme="light"] {';
    for (const key in theme.light) {
      css += `${key}: ${theme.light[key]};`;
    }
    // 添加字体变量
    if (fontMode === 'aacute') {
      css += "--font-family-base: 'Aa偷吃可爱长大的', var(--font-family-fallbacks) !important;";
      css += "--font-family-mono: 'Aa偷吃可爱长大的', var(--font-family-fallbacks) !important;";
    } else if (fontMode === 'custom') {
      css += "--font-family-base: 'CustomFont', var(--font-family-fallbacks) !important;";
      css += "--font-family-mono: 'CustomFont', var(--font-family-fallbacks) !important;";
    } else {
      css += '--font-family-base: var(--font-family-fallbacks) !important;';
      css += '--font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;';
    }
    css += '}';

    css += '.dark, [data-theme="dark"] {';
    for (const key in theme.dark) {
      css += `${key}: ${theme.dark[key]};`;
    }
    // 添加字体变量
    if (fontMode === 'aacute') {
      css += "--font-family-base: 'Aa偷吃可爱长大的', var(--font-family-fallbacks) !important;";
      css += "--font-family-mono: 'Aa偷吃可爱长大的', var(--font-family-fallbacks) !important;";
    } else if (fontMode === 'custom') {
      css += "--font-family-base: 'CustomFont', var(--font-family-fallbacks) !important;";
      css += "--font-family-mono: 'CustomFont', var(--font-family-fallbacks) !important;";
    } else {
      css += '--font-family-base: var(--font-family-fallbacks) !important;';
      css += '--font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;';
    }
    css += '}';

    res.send(css);
  });

  // 动态生成 sw.js
  app.get('/webui/sw.js', async (_req, res) => {
    try {
      // 读取模板文件
      let templatePath = resolve(__dirname, 'static', 'sw_template.js');
      if (!existsSync(templatePath)) {
        templatePath = resolve(__dirname, 'src', 'assets', 'sw_template.js');
      }

      let swContent = readFileSync(templatePath, 'utf-8');

      // 替换版本号
      // 使用 napCatVersion，如果为 alpha 则尝试加上时间戳或其他标识以避免缓存冲突，或者直接使用
      // 用户要求控制 sw.js 版本，napCatVersion 是核心控制点
      swContent = swContent.replace('{{VERSION}}', napCatVersion);

      res.header('Content-Type', 'application/javascript');
      res.header('Service-Worker-Allowed', '/webui/');
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(swContent);
    } catch (error) {
      console.error('[NapCat] [WebUi] Error generating sw.js', error);
      res.status(500).send('Error generating service worker');
    }
  });

  // ------------中间件结束------------

  // ------------挂载路由------------
  // 挂载静态路由（前端），路径为 /webui
  app.use('/webui', express.static(pathWrapper.staticPath, {
    maxAge: '1d',
  }));

  // 初始化WebSocket服务器
  const sslCerts = await checkCertificates(logger);
  const isHttps = !!sslCerts;
  const server = isHttps && sslCerts ? createHttpsServer(sslCerts, app) : createServer(app);
  server.on('upgrade', (request, socket, head) => {
    const error = externalAuthError(request, true);
    if (error) {
      socket.end(`HTTP/1.1 ${error.status} ${STATUS_CODES[error.status]}\r\nConnection: close\r\n\r\n`);
      return;
    }
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    // 检查是否是调试 WebSocket 连接
    if (url.pathname.startsWith('/api/Debug/ws')) {
      handleDebugWebSocket(request, socket, head);
    } else {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    }
  });
  // 挂载API接口
  app.use('/api', ALLRouter);
  // 所有剩下的请求都转到静态页面
  const indexFile = join(pathWrapper.staticPath, 'index.html');

  app.all(/\/webui\/(.*)/, (_req, res) => {
    res.sendFile(indexFile);
  });

  // 初始服务（先放个首页）
  app.all('/', (_req, res) => {
    res.status(301).header('Location', '/webui/').send();
  });

  // 错误处理中间件，捕获multer的错误
  app.use((err: Error, _: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      return sendError(res, err.message, true);
    }
    next(err);
  });

  // 全局错误处理中间件（非multer错误）
  app.use((_: Error, __: express.Request, res: express.Response, ___: express.NextFunction) => {
    sendError(res, 'An unknown error occurred.', true);
  });

  // ------------启动服务------------
  server.listen(port, host, () => {
    logger.log(`[NapCat] [WebUi] External authentication enabled: ${publicOrigin}/webui/`);
  });

  // ------------Over！------------
}

async function tryUseHost (host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const server = net.createServer();
      server.on('listening', () => {
        server.close();
        resolve(host);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRNOTAVAIL') {
          reject(new Error('主机地址验证失败，可能为非本机地址'));
        } else {
          reject(new Error(`遇到错误: ${err.code}`));
        }
      });

      // 尝试监听 让系统随机分配一个端口
      server.listen(0, host);
    } catch (error) {
      // 这里捕获到的错误应该是启动服务器时的同步错误
      reject(new Error(`服务器启动时发生错误: ${error}`));
    }
  });
}

async function tryUsePort (port: number, host: string, tryCount: number = 0, singleTry: boolean = false): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      const server = net.createServer();
      server.on('listening', () => {
        server.close();
        resolve(port);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          if (singleTry) {
            // 只尝试一次，端口被占用则直接失败
            reject(new Error(`端口 ${port} 已被占用`));
          } else if (tryCount < MAX_PORT_TRY) {
            // 递归尝试下一个端口
            resolve(tryUsePort(port + 1, host, tryCount + 1, false));
          } else {
            reject(new Error(`端口尝试失败，达到最大尝试次数: ${MAX_PORT_TRY}`));
          }
        } else {
          reject(new Error(`遇到错误: ${err.code}`));
        }
      });

      // 尝试监听端口
      server.listen(port, host);
    } catch (error) {
      // 这里捕获到的错误应该是启动服务器时的同步错误
      reject(new Error(`服务器启动时发生错误: ${error}`));
    }
  });
}
