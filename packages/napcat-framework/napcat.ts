import { getNapigConfig } from 'napcat-common/src/config';
import { createManagedLogin } from '../napcat-shell/managed-login';
import { NapCatPathWrapper } from 'napcat-common/src/path';
import { configureExternalAuth } from '@/napcat-webui-backend/src/helper/ExternalAuth';
import { InitWebUi } from 'napcat-webui-backend/index';
import { NapCatAdapterManager } from 'napcat-adapter';
import { NativePacketHandler } from 'napcat-core/packet/handler/client';
import { Napi2NativeLoader } from 'napcat-core/packet/handler/napi2nativeLoader';
import { loadNapcatConfig } from '@/napcat-core/helper/config';
import { FFmpegService } from 'napcat-core/helper/ffmpeg/ffmpeg';
import { logSubscription, LogWrapper } from 'napcat-core/helper/log';
import { QQBasicInfoWrapper } from '@/napcat-core/helper/qq-basic-info';
import { InstanceContext, loadQQWrapper, NapCatCore, NapCatCoreWorkingEnv, NodeIKernelLoginListener, NodeIKernelLoginService, NodeIQQNTWrapperSession, SelfInfo, WrapperNodeApi } from '@/napcat-core';
import { proxiedListenerOf } from '@/napcat-core/helper/proxy-handler';
import { createOfflineRecovery } from '@/napcat-core/helper/offline-recovery';
import { statusHelperSubscription } from '@/napcat-core/helper/status';
import { WebUiDataRuntime } from '@/napcat-webui-backend/src/helper/Data';
import { NapProtoMsg } from 'napcat-protobuf';
import { OidbSvcTrpcTcpBase, OidbSvcTrpcTcp0XCDE_2RespBody } from '@/napcat-core/packet/transformer/proto';

// Framework ES入口文件
export async function getWebUiUrl () {
  return new URL('/webui/', configureExternalAuth()).toString();
}

export async function NCoreInitFramework (
  session: NodeIQQNTWrapperSession | Promise<NodeIQQNTWrapperSession>,
  loginService: NodeIKernelLoginService,
  registerInitCallback: (callback: () => void) => void
) {
  // 在进入本层前是否登录未进行判断
  console.log('NapCat Framework App Loading...');
  const config = getNapigConfig();
  if (config.qqbot) throw new Error('qqbot requires Shell Master mode; Framework does not support the official bot management connection');

  process.on('uncaughtException', (err) => {
    console.log('[NapCat] [Error] Unhandled Exception:', err.message);
  });

  process.on('unhandledRejection', (reason) => {
    console.log('[NapCat] [Error] unhandledRejection:', reason);
  });

  const pathWrapper = new NapCatPathWrapper();

  const logger = new LogWrapper(pathWrapper.logsPath);
  const basicInfoWrapper = new QQBasicInfoWrapper({ logger });
  const wrapper = loadQQWrapper(basicInfoWrapper.QQMainPath, basicInfoWrapper.getFullQQVersion());
  const nativePacketHandler = new NativePacketHandler({ logger }); // 初始化 NativePacketHandler 用于后续使用
  const napi2nativeLoader = new Napi2NativeLoader({ logger }); // 初始化 Napi2NativeLoader 用于后续使用
  const napcatConfig = loadNapcatConfig(pathWrapper.configPath);
  // console.log('[NapCat] [Napi2NativeLoader]', napi2nativeLoader.nativeExports.enableAllBypasses?.());
  if (process.env['NAPCAT_DISABLE_BYPASS'] !== '1') {
    const bypassOptions = napcatConfig.bypass ?? {};
    const bypassEnabled = napi2nativeLoader.nativeExports.enableAllBypasses?.(bypassOptions);
    if (bypassEnabled) {
      logger.log('[NapCat] Napi2NativeLoader: 已启用Bypass');
    }
    logger.log('[NapCat] Napi2NativeLoader: Framework模式Bypass配置:', bypassOptions);
  } else {
    logger.log('[NapCat] Napi2NativeLoader: Bypass已通过环境变量禁用');
  }
  // nativePacketHandler.onAll((packet) => {
  //     console.log('[Packet]', packet.uin, packet.cmd, packet.hex_data);
  // });
  await nativePacketHandler.init(basicInfoWrapper.getFullQQVersion(), napcatConfig.o3HookMode === 1);
  // 在 init 之后注册监听器

  // 登录前监听 OidbSvcTrpcTcp.0xcde_2 数据包，获取数据库 passphrase
  let dbPassphrase: string | undefined;
  nativePacketHandler.onCmd('OidbSvcTrpcTcp.0xcde_2', ({ type, hex_data }) => {
    if (type !== 1) return; // 仅处理接收方向
    try {
      const raw = Buffer.from(hex_data, 'hex');
      const base = new NapProtoMsg(OidbSvcTrpcTcpBase).decode(raw);
      if (base.body && base.body.length > 0) {
        const body = new NapProtoMsg(OidbSvcTrpcTcp0XCDE_2RespBody).decode(base.body);
        if (body.inner?.value) {
          dbPassphrase = body.inner.value;
          logger.log('[NapCat] 已启用数据库辅助支持能力');
        }
      }
    } catch (e) {
      logger.logError('[NapCat] [0xCDE_2] 解析失败:', e);
    }
  });

  // 初始化 FFmpeg 服务
  await FFmpegService.init(pathWrapper.binaryPath, logger);

  // 提前启动 WebUI，使其在登录前可用，支持通过 WebUI 操控登录过程
  WebUiDataRuntime.setWorkingEnv(NapCatCoreWorkingEnv.Framework);
  InitWebUi(logger, pathWrapper, logSubscription, statusHelperSubscription).then().catch(e => logger.logError(e));

  // 直到登录成功后，执行下一步
  const selfInfo = await new Promise<SelfInfo>((resolve) => {
    const loginContext = { isLogined: false };
    let managedLogin: ReturnType<typeof createManagedLogin> | undefined;

    const loginListener = new NodeIKernelLoginListener();

    loginListener.onUserLoggedIn = (userid: string) => {
      const tips = `当前账号(${userid})已登录,无法重复登录`;
      logger.logError(tips);
      WebUiDataRuntime.setQQLoginError(tips);
    };

    loginListener.onQRCodeLoginSucceed = async (loginResult) => {
      if (WebUiDataRuntime.getOneBotContext()?.core?.sessionExpiredReason || WebUiDataRuntime.getQQLoginPhase() === 'qrcode_failed') return;
      if (String(loginResult.uin) !== config.account.id) {
        managedLogin?.clear();
        WebUiDataRuntime.setQQLoginStatus(false);
        WebUiDataRuntime.setAccountReason('account_mismatch', 'QQ 账号与配置不符，请退出 QQ 后登录配置账号');
        WebUiDataRuntime.setQQLoginPhase('offline');
        return;
      }
      managedLogin?.clear();
      WebUiDataRuntime.setAccountReason(undefined, '');
      WebUiDataRuntime.setQQSessionExpiredReason('');
      loginContext.isLogined = true;
      WebUiDataRuntime.setQQLoginStatus(true);
      WebUiDataRuntime.setQQLoginError('');
      const oneBotContext = WebUiDataRuntime.getOneBotContext();
      if (oneBotContext?.core?.selfInfo) {
        oneBotContext.core.setOnline(true);
        WebUiDataRuntime.setQQLoginPhase('ready');
      } else {
        WebUiDataRuntime.setQQLoginPhase('initializing');
      }
      await new Promise<void>(resolve => {
        registerInitCallback(() => resolve());
      });
      resolve({
        uid: loginResult.uid,
        uin: loginResult.uin,
        nick: '', // 获取不到
        online: true,
      });
    };

    loginListener.onQRCodeSessionUserScaned = () => {
      if (!['generating_qrcode', 'waiting_qrcode', 'qrcode_scanned'].includes(WebUiDataRuntime.getQQLoginPhase())) return;
      WebUiDataRuntime.setQQLoginPhase('qrcode_scanned');
    };

    loginListener.onQRCodeGetPicture = ({ qrcodeUrl }) => {
      if (!qrcodeUrl) return;
      if (!['generating_qrcode', 'waiting_qrcode', 'qrcode_scanned'].includes(WebUiDataRuntime.getQQLoginPhase())) return;
      WebUiDataRuntime.setQQLoginQrcodeURL(qrcodeUrl);
      WebUiDataRuntime.setQQLoginError('');
      WebUiDataRuntime.setQQLoginPhase('waiting_qrcode');
      logger.log('[NapCat] [Framework] 二维码已更新, URL:', qrcodeUrl);
    };

    loginListener.onQRCodeSessionFailed = (errType: number, errCode: number) => {
      if (!loginContext.isLogined && ['generating_qrcode', 'waiting_qrcode', 'qrcode_scanned'].includes(WebUiDataRuntime.getQQLoginPhase())) {
        logger.logError('[NapCat] [Framework] [Login] QRCode Session Failed, ErrType:', errType, 'ErrCode:', errCode);
        if (errType === 1 && errCode === 5) {
          WebUiDataRuntime.setQQLoginStatus(false);
          WebUiDataRuntime.setQQLoginQrcodeURL('');
          WebUiDataRuntime.setQQLoginPhase('qrcode_failed');
          WebUiDataRuntime.setQQLoginError('手机端未完成本次扫码登录，请刷新二维码后重新扫码');
          return;
        }
        if (errType === 1 && errCode === 3) {
          WebUiDataRuntime.setQQLoginError('二维码已过期，请刷新');
        }
      }
    };

    loginListener.onLoginFailed = () => {
      if (loginContext.isLogined) return;
      managedLogin?.clear();
      WebUiDataRuntime.setAccountReason('login_failed', 'QQ 登录失败，请重新登录');
      WebUiDataRuntime.setQQLoginPhase('offline');
    };
    loginListener.onLoginDisConnected = () => {
      managedLogin?.clear();
      loginContext.isLogined = false;
      WebUiDataRuntime.setQQLoginStatus(false);
      WebUiDataRuntime.setAccountReason('login_failed', 'QQ 登录服务连接已断开');
      WebUiDataRuntime.setQQLoginPhase('offline');
    };
    loginListener.onLoginConnected = async () => {
      if (loginContext.isLogined) return;
      if (!managedLogin) {
        const history = await loginService.getLoginList();
        managedLogin = createManagedLogin(loginService, () => loginService.getQRCodePicture(), history.LocalLoginInfoList.some(item => item.uin === config.account.id));
        WebUiDataRuntime.setRefreshQRCodeCallback(async () => {
          const result = await managedLogin!.start('qr');
          if (!result.result) throw new Error(result.message);
        });
        await managedLogin.start('auto');
      } else {
        await managedLogin.start('qr');
      }
    };

    loginService.addKernelLoginListener(proxiedListenerOf(loginListener, logger));
  });
  // 过早进入会导致addKernelMsgListener等Listener添加失败
  // await sleep(2500);
  // 初始化 NapCatFramework
  // 新版 wrapper 的会话由 QQ 在启动过程中创建，dlopen 时可能尚不存在。
  const wrapperSession = await session;
  if (!wrapperSession) throw new Error('QQ 未提供有效的 Framework Session');
  const loaderObject = new NapCatFramework(wrapper, wrapperSession, logger, selfInfo, basicInfoWrapper, pathWrapper, nativePacketHandler, napi2nativeLoader);
  // 将捕获的 passphrase 设置到 core 上，供 DatabaseApi 使用
  if (dbPassphrase) {
    loaderObject.core.dbPassphrase = dbPassphrase;
  }
  await loaderObject.core.initCore();

  // 登录成功后设置数据路径
  WebUiDataRuntime.setQQDataPath(loaderObject.core.dataPath);

  // // 测试 DatabaseApi
  // if (dbPassphrase) {
  //   const dbApi = loaderObject.core.apis.DatabaseApi;
  //   const sqliteOk = await dbApi.isSqliteAvailable();
  //   if (sqliteOk) {
  //     try {
  //       const result = dbApi.readDatabase('nt_msg.db');
  //       if (result) {
  //         logger.log('[NapCat] [Database] nt_msg.db:\n' + dbApi.formatResults([result]));
  //       }
  //     } catch (e) {
  //       logger.logError('[NapCat] [Database] 读取失败:', e);
  //     }
  //   }
  // }

  // 使用 NapCatAdapterManager 统一管理协议适配器
  const adapterManager = new NapCatAdapterManager(loaderObject.core, loaderObject.context, pathWrapper);
  await adapterManager.initAdapters();
  // 注册 OneBot 适配器到 WebUiDataRuntime，供调试功能使用
  const oneBotAdapter = adapterManager.getOneBotAdapter();
  if (oneBotAdapter) {
    WebUiDataRuntime.setOneBotContext(oneBotAdapter);
    if (WebUiDataRuntime.getQQLoginStatus()) {
      WebUiDataRuntime.setQQLoginPhase('ready');
    }
  }

  // 监听下线并同步到 WebUI（兜底保障，防止 WebUI 状态不同步）
  // KickedOffLine：账号被踢下线；SelfOffline：静默离线（服务端会话语义失效但无通知）。
  // 下线和身份失效共用恢复调度；保留失效原因并禁止复活旧 Core。
  const handleOffline = createOfflineRecovery({
    isOnline: () => loaderObject.core.isOnline,
    onOffline: (tips) => {
      if (loaderObject.core.sessionExpiredReason) WebUiDataRuntime.setQQSessionExpiredReason(loaderObject.core.sessionExpiredReason);
      WebUiDataRuntime.setQQLoginStatus(false);
      // 下线后的二维码已失效，绝不能继续交给页面展示或扫码。
      WebUiDataRuntime.setQQLoginQrcodeURL('');
      WebUiDataRuntime.setQQLoginError(tips);
      WebUiDataRuntime.setQQLoginPhase('reconnecting');
    },
    onRecovered: () => {
      WebUiDataRuntime.setAccountReason(undefined, '');
      WebUiDataRuntime.setQQLoginStatus(true);
      WebUiDataRuntime.setQQLoginError('');
      WebUiDataRuntime.setQQLoginPhase('ready');
    },
    restart: async (tips) => {
      try {
        const restartResult = await WebUiDataRuntime.requestRestartProcess({ sessionExpiredReason: loaderObject.core.sessionExpiredReason });
        logger.logWarn('[NapCat] [Framework] 账号已离线，正在重启 Worker 以重新创建 QQ 登录服务', restartResult);
        if (restartResult.result) return true;
        WebUiDataRuntime.setQQLoginPhase('offline');
        WebUiDataRuntime.setQQLoginError(`${tips}\n登录服务重启失败：${restartResult.message}`);
      } catch (error) {
        WebUiDataRuntime.setQQLoginPhase('offline');
        WebUiDataRuntime.setQQLoginError(`${tips}\n登录服务重启失败：${(error as Error).message}`);
      }
      return false;
    },
  });
  loaderObject.core.event.on('KickedOffLine', (tips: string) => handleOffline(tips, false));
  loaderObject.core.event.on('SelfOffline', (tips: string) => handleOffline(tips, true));
  loaderObject.core.event.on('SessionExpired', (tips: string) => handleOffline(tips, false));
}

export class NapCatFramework {
  public core: NapCatCore;
  context: InstanceContext;

  constructor (
    wrapper: WrapperNodeApi,
    session: NodeIQQNTWrapperSession,
    logger: LogWrapper,
    selfInfo: SelfInfo,
    basicInfoWrapper: QQBasicInfoWrapper,
    pathWrapper: NapCatPathWrapper,
    packetHandler: NativePacketHandler,
    napi2nativeLoader: Napi2NativeLoader
  ) {
    this.context = {
      packetHandler,
      napi2nativeLoader,
      workingEnv: NapCatCoreWorkingEnv.Framework,
      wrapper,
      session,
      logger,
      basicInfoWrapper,
      pathWrapper,
    };
    this.core = new NapCatCore(this.context, selfInfo);
  }
}
