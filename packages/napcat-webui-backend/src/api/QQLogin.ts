import { getNapigConfig } from 'napcat-common/src/config';
import { RequestHandler } from 'express';
import https from 'https';

import { WebUiDataRuntime } from '@/napcat-webui-backend/src/helper/Data';
import { webUiLogger } from '@/napcat-webui-backend/index';
import { isEmpty } from '@/napcat-webui-backend/src/utils/check';
import { sendError, sendSuccess } from '@/napcat-webui-backend/src/utils/response';
import {
  Registry20Utils,
  MachineInfoUtils,
  getGlobalDataPath,
  MacMachineInfoUtils,
  computeMacGuidInfo,
  getMacPlatformUuid,
  getMacSn,
  getMacSerialNumber,
  getMacDiskSerial,
  getMacPrimaryMac,
} from '@/napcat-webui-backend/src/utils/guid';
import os from 'node:os';
import { getLoginDiagnostics } from '@/napcat-core/helper/login-diagnostics';

function logLoginControl (action: string) {
  webUiLogger?.logWarn('[Core] [LoginControl]', { action, source: 'webui', ...getLoginDiagnostics(), loginPhase: WebUiDataRuntime.getQQLoginPhase() });
}

// oidb 新设备验证请求辅助函数
function oidbRequest (uid: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = https.request({
      hostname: 'oidb.tim.qq.com',
      path: `/v3/oidbinterface/oidb_0xc9e_8?uid=${encodeURIComponent(uid)}&getqrcode=1&sdkappid=39998&actype=2`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Failed to parse oidb response'));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 获取 QQ 数据根目录 (dataPath)
const getQQDataPath = (): string => {
  // 优先从 WebUiDataRuntime 获取早期设置的 dataPath
  let dataPath = WebUiDataRuntime.getQQDataPath();
  if (!dataPath) {
    // 回退: 从 OneBotContext 获取
    const oneBotContext = WebUiDataRuntime.getOneBotContext();
    dataPath = oneBotContext?.core?.dataPath;
  }
  if (!dataPath) {
    throw new Error('QQ data path not available yet');
  }
  return dataPath;
};

// 获取 Registry20 路径的辅助函数
const getRegistryPath = () => {
  return Registry20Utils.getRegistryPath(getQQDataPath());
};

// 获取 machine-info 路径的辅助函数 (Linux)
const getMachineInfoPath = () => {
  return MachineInfoUtils.getMachineInfoPath(getQQDataPath());
};

// 获取QQ登录二维码
export const QQGetQRcodeHandler: RequestHandler = async (_, res) => {
  // 判断是否已经登录
  if (WebUiDataRuntime.getQQLoginStatus()) {
    // 已经登录
    return sendError(res, 'QQ Is Logined');
  }
  // 获取二维码
  const qrcodeUrl = WebUiDataRuntime.getQQLoginQrcodeURL();
  // 判断二维码是否为空
  if (isEmpty(qrcodeUrl)) {
    return sendError(res, 'QRCode Get Error');
  }
  // 返回二维码URL
  const data = {
    qrcode: qrcodeUrl,
  };
  return sendSuccess(res, data);
};

// 获取QQ登录状态
export const QQCheckLoginStatusHandler: RequestHandler = async (_, res) => {
  // 从 OneBot 上下文获取实时的 selfInfo.online 状态
  const oneBotContext = WebUiDataRuntime.getOneBotContext();
  const isOnline = oneBotContext?.core?.isOnline;
  const sessionExpiredReason = oneBotContext?.core?.sessionExpiredReason || WebUiDataRuntime.getQQSessionExpiredReason();
  const qqLoginStatus = WebUiDataRuntime.getQQLoginStatus();
  const loginPhase = WebUiDataRuntime.getQQLoginPhase();
  // 必须同时满足：已登录且在线（online 必须明确为 true）
  // 登录状态以 QQ 登录成功和 Core 明确在线为准。loginPhase 用于展示进度，
  // 不能作为跳转的额外门槛，否则 phase 事件延迟时会卡在扫码页。
  const isLogin = !sessionExpiredReason && qqLoginStatus && isOnline === true;
  // 检测掉线状态：已登录但不在线
  const isOffline = qqLoginStatus && isOnline === false;
  const data = {
    isLogin,
    account: getNapigConfig().account.id,
    attempt: WebUiDataRuntime.getLoginAttempt(),
    isOffline,
    loginPhase,
    qrLoginAccepted: qqLoginStatus && (loginPhase === 'qrcode_scanned' || loginPhase === 'initializing'),
    coreReady: isLogin,
    sessionExpired: !!sessionExpiredReason,
    sessionExpiredReason,
    qrcodeurl: WebUiDataRuntime.getQQLoginQrcodeURL(),
    loginError: WebUiDataRuntime.getQQLoginError() || sessionExpiredReason,
  };
  return sendSuccess(res, data);
};

export const QQLoginHandler: RequestHandler = async (req, res) => {
  const { method = 'auto' } = req.body;
  if (method !== 'auto' && method !== 'qr') return sendError(res, '无效的登录方式');
  logLoginControl(method);
  const result = await WebUiDataRuntime.requestAccountLogin(method);
  return result.result ? sendSuccess(res, result) : sendError(res, result.message);
};

// 获取登录的QQ的信息
export const getQQLoginInfoHandler: RequestHandler = async (_, res) => {
  const basicInfo = WebUiDataRuntime.getQQLoginInfo();
  // 从 OneBot 上下文获取实时的 selfInfo.online 状态
  const oneBotContext = WebUiDataRuntime.getOneBotContext();
  const selfInfo = oneBotContext?.core?.selfInfo;
  const online = oneBotContext?.core?.isOnline ?? undefined;
  const avatarUrl = selfInfo?.avatarUrl;
  const data = {
    ...basicInfo,
    online,
    avatarUrl,
  };
  return sendSuccess(res, data);
};

// 刷新QQ登录二维码
export const QQRefreshQRcodeHandler: RequestHandler = async (_, res) => {
  logLoginControl('refresh-qrcode');
  // 与 CheckLoginStatus 保持一致：运行时登录标记可能在账号下线后
  // 尚未同步，但 core.selfInfo.online 已能反映实际在线状态。
  const oneBotContext = WebUiDataRuntime.getOneBotContext();
  const isOnline = oneBotContext?.core?.selfInfo?.online === true;
  if (WebUiDataRuntime.getQQLoginStatus() && isOnline) {
    // 已经登录
    return sendError(res, 'QQ Is Logined');
  }
  // 被踢下线后，后台会从 KickedOffLine 事件异步重启 Worker。不要在这个
  // HTTP 请求里再次触发刷新/重启，否则 Worker 退出会打断该响应。
  if (WebUiDataRuntime.getQQLoginPhase() === 'reconnecting') {
    return sendSuccess(res, { qrcodeurl: '', restarting: true });
  }
  try {
    const qrcodeurl = await WebUiDataRuntime.refreshQRCode();
    return sendSuccess(res, { qrcodeurl });
  } catch (error) {
    return sendError(res, `QRCode Refresh Error: ${(error as Error).message}`);
  }
};

export const QQCaptchaLoginHandler: RequestHandler = async (req, res) => {
  const { attemptId, ticket, randstr, sid = '' } = req.body;
  if (![attemptId, ticket, randstr].every(v => typeof v === 'string' && v) || typeof sid !== 'string') return sendError(res, '验证码参数不完整');
  const result = await WebUiDataRuntime.requestCaptchaLogin(attemptId, ticket, randstr, sid);
  return result.result ? sendSuccess(res, result) : sendError(res, result.message);
};

export const QQNewDeviceLoginHandler: RequestHandler = async (req, res) => {
  const { attemptId, token } = req.body;
  if (typeof attemptId !== 'string' || !attemptId || typeof token !== 'string') return sendError(res, '设备验证参数不完整');
  const result = await WebUiDataRuntime.requestNewDeviceLogin(attemptId, token);
  return result.result ? sendSuccess(res, result) : sendError(res, result.message);
};

// 重置设备信息
export const QQResetDeviceIDHandler: RequestHandler = async (_, res) => {
  try {
    const registryPath = getRegistryPath();
    // 自动备份
    try {
      await Registry20Utils.backup(registryPath);
    } catch (_e) {
      // 忽略备份错误（例如文件不存在）
    }

    await Registry20Utils.delete(registryPath);
    return sendSuccess(res, { message: 'Device ID reset successfully (Registry20 deleted)' });
  } catch (e) {
    return sendError(res, `Failed to reset Device ID: ${(e as Error).message}`);
  }
};

// 获取设备 GUID
export const QQGetDeviceGUIDHandler: RequestHandler = async (_, res) => {
  try {
    const registryPath = getRegistryPath();
    const guid = await Registry20Utils.readGuid(registryPath);
    return sendSuccess(res, { guid });
  } catch (e) {
    // 可能是文件不存在，或者非 Windows 平台，或者解密失败
    return sendError(res, `Failed to get GUID: ${(e as Error).message}`);
  }
};

// 设置设备 GUID
export const QQSetDeviceGUIDHandler: RequestHandler = async (req, res) => {
  const { guid } = req.body;
  if (!guid || typeof guid !== 'string' || guid.length !== 32) {
    return sendError(res, 'Invalid GUID format, must be 32 hex characters');
  }
  try {
    const registryPath = getRegistryPath();
    // 自动备份
    try {
      await Registry20Utils.backup(registryPath);
    } catch { }

    await Registry20Utils.writeGuid(registryPath, guid);
    return sendSuccess(res, { message: 'GUID set successfully' });
  } catch (e) {
    return sendError(res, `Failed to set GUID: ${(e as Error).message}`);
  }
};

// 获取备份列表
export const QQGetGUIDBackupsHandler: RequestHandler = async (_, res) => {
  try {
    const registryPath = getRegistryPath();
    const backups = Registry20Utils.getBackups(registryPath);
    return sendSuccess(res, backups);
  } catch (e) {
    return sendError(res, `Failed to get backups: ${(e as Error).message}`);
  }
};

// 恢复备份
export const QQRestoreGUIDBackupHandler: RequestHandler = async (req, res) => {
  const { backupName } = req.body;
  if (!backupName) {
    return sendError(res, 'Backup name is required');
  }
  try {
    const registryPath = getRegistryPath();
    await Registry20Utils.restore(registryPath, backupName);
    return sendSuccess(res, { message: 'Restored successfully' });
  } catch (e) {
    return sendError(res, `Failed to restore: ${(e as Error).message}`);
  }
};

// 创建备份
export const QQCreateGUIDBackupHandler: RequestHandler = async (_, res) => {
  try {
    const registryPath = getRegistryPath();
    const backupPath = await Registry20Utils.backup(registryPath);
    return sendSuccess(res, { message: 'Backup created', path: backupPath });
  } catch (e) {
    return sendError(res, `Failed to backup: ${(e as Error).message}`);
  }
};

// 重启NapCat
export const QQRestartNapCatHandler: RequestHandler = async (_, res) => {
  logLoginControl('restart');
  try {
    const result = await WebUiDataRuntime.requestRestartProcess();
    if (result.result) {
      return sendSuccess(res, { message: result.message || 'Restart initiated' });
    } else {
      return sendError(res, result.message || 'Restart failed');
    }
  } catch (e) {
    return sendError(res, `Restart error: ${(e as Error).message}`);
  }
};

// ============================================================
// 平台信息 & Linux GUID 管理
// ============================================================

// 获取平台信息
export const QQGetPlatformInfoHandler: RequestHandler = async (_, res) => {
  return sendSuccess(res, { platform: os.platform() });
};

// 获取 Linux MAC 地址 (从 machine-info 文件读取)
export const QQGetLinuxMACHandler: RequestHandler = async (_, res) => {
  try {
    const machineInfoPath = getMachineInfoPath();
    const mac = MachineInfoUtils.readMac(machineInfoPath);
    return sendSuccess(res, { mac });
  } catch (e) {
    return sendError(res, `Failed to get MAC: ${(e as Error).message}`);
  }
};

// 设置 Linux MAC 地址 (写入 machine-info 文件)
export const QQSetLinuxMACHandler: RequestHandler = async (req, res) => {
  const { mac } = req.body;
  if (!mac || typeof mac !== 'string') {
    return sendError(res, 'MAC address is required');
  }
  try {
    const machineInfoPath = getMachineInfoPath();
    // 自动备份
    try {
      MachineInfoUtils.backup(machineInfoPath);
    } catch { }

    MachineInfoUtils.writeMac(machineInfoPath, mac);
    return sendSuccess(res, { message: 'MAC set successfully' });
  } catch (e) {
    return sendError(res, `Failed to set MAC: ${(e as Error).message}`);
  }
};

// 获取 Linux machine-id
export const QQGetLinuxMachineIdHandler: RequestHandler = async (_, res) => {
  try {
    const machineId = MachineInfoUtils.readMachineId();
    return sendSuccess(res, { machineId });
  } catch (e) {
    return sendError(res, `Failed to read machine-id: ${(e as Error).message}`);
  }
};

// 计算 Linux GUID (用于前端实时预览)
export const QQComputeLinuxGUIDHandler: RequestHandler = async (req, res) => {
  const { mac, machineId } = req.body;
  try {
    // 如果没传 machineId，从 /etc/machine-id 读取
    let mid = machineId;
    if (!mid || typeof mid !== 'string') {
      try {
        mid = MachineInfoUtils.readMachineId();
      } catch {
        mid = '';
      }
    }
    // 如果没传 mac，从 machine-info 文件读取
    let macStr = mac;
    if (!macStr || typeof macStr !== 'string') {
      try {
        const machineInfoPath = getMachineInfoPath();
        macStr = MachineInfoUtils.readMac(machineInfoPath);
      } catch {
        macStr = '';
      }
    }
    const guid = MachineInfoUtils.computeGuid(mid, macStr);
    return sendSuccess(res, { guid, machineId: mid, mac: macStr });
  } catch (e) {
    return sendError(res, `Failed to compute GUID: ${(e as Error).message}`);
  }
};

// 获取 Linux machine-info 备份列表
export const QQGetLinuxMachineInfoBackupsHandler: RequestHandler = async (_, res) => {
  try {
    const machineInfoPath = getMachineInfoPath();
    const backups = MachineInfoUtils.getBackups(machineInfoPath);
    return sendSuccess(res, backups);
  } catch (e) {
    return sendError(res, `Failed to get backups: ${(e as Error).message}`);
  }
};

// 创建 Linux machine-info 备份
export const QQCreateLinuxMachineInfoBackupHandler: RequestHandler = async (_, res) => {
  try {
    const machineInfoPath = getMachineInfoPath();
    const backupPath = MachineInfoUtils.backup(machineInfoPath);
    return sendSuccess(res, { message: 'Backup created', path: backupPath });
  } catch (e) {
    return sendError(res, `Failed to backup: ${(e as Error).message}`);
  }
};

// 恢复 Linux machine-info 备份
export const QQRestoreLinuxMachineInfoBackupHandler: RequestHandler = async (req, res) => {
  const { backupName } = req.body;
  if (!backupName) {
    return sendError(res, 'Backup name is required');
  }
  try {
    const machineInfoPath = getMachineInfoPath();
    MachineInfoUtils.restore(machineInfoPath, backupName);
    return sendSuccess(res, { message: 'Restored successfully' });
  } catch (e) {
    return sendError(res, `Failed to restore: ${(e as Error).message}`);
  }
};

// 重置 Linux 设备信息 (删除 machine-info)
export const QQResetLinuxDeviceIDHandler: RequestHandler = async (_, res) => {
  try {
    const machineInfoPath = getMachineInfoPath();
    // 自动备份
    try {
      MachineInfoUtils.backup(machineInfoPath);
    } catch { }

    MachineInfoUtils.delete(machineInfoPath);
    return sendSuccess(res, { message: 'Device ID reset successfully (machine-info deleted)' });
  } catch (e) {
    return sendError(res, `Failed to reset Device ID: ${(e as Error).message}`);
  }
};

// ============================================================
// macOS GUID 管理 (machineid-info / TEA)
// ============================================================

// macOS: 当前生效的 GUID 与来源信息
export const QQGetMacGUIDInfoHandler: RequestHandler = async (_, res) => {
  try {
    const dataPathGlobal = getGlobalDataPath(getQQDataPath());
    const info = await computeMacGuidInfo(dataPathGlobal);
    return sendSuccess(res, info);
  } catch (e) {
    return sendError(res, `Failed to get macOS GUID: ${(e as Error).message}`);
  }
};

// macOS: 本机硬件信息 (UUID / SN / 主网卡 MAC)
export const QQGetMacHardwareInfoHandler: RequestHandler = async (_, res) => {
  try {
    const [mac, platformUuid, serialNumber, diskSerial] = await Promise.all([
      getMacPrimaryMac(),
      getMacPlatformUuid(),
      getMacSerialNumber(),
      getMacDiskSerial(),
    ]);
    return sendSuccess(res, {
      platformUuid: platformUuid ?? '',
      serialNumber: serialNumber ?? '',
      diskSerial: diskSerial ?? '',
      mac: mac ? mac.toString('hex') : '',
    });
  } catch (e) {
    return sendError(res, `Failed to get macOS hardware info: ${(e as Error).message}`);
  }
};

// macOS: 修改 machine_id (写入 TEA 加密的 machineid-info)
export const QQSetMacMachineIdHandler: RequestHandler = async (req, res) => {
  const { machineId, sn } = req.body;
  if (!machineId || typeof machineId !== 'string' || !/^[0-9a-fA-F]{16}$/.test(machineId)) {
    return sendError(res, 'Invalid machine_id, must be 16 hex characters');
  }
  try {
    const dataPathGlobal = getGlobalDataPath(getQQDataPath());
    const uuid = await getMacPlatformUuid();
    if (!uuid) {
      return sendError(res, 'IOPlatformUUID not available, cannot derive TEA key');
    }
    const key = MacMachineInfoUtils.keyFromUuid(uuid);
    const machineIdInfoPath = MacMachineInfoUtils.getMachineIdInfoPath(dataPathGlobal);
    // SN 留空 = 沿用当前生效值: 优先 machineid-info 内已有 SN, 其次本机硬件 SN
    let snValue: string;
    if (typeof sn === 'string' && sn.length > 0) {
      snValue = sn;
    } else {
      const existing = MacMachineInfoUtils.readMachineIdInfo(machineIdInfoPath, key);
      snValue = existing?.sn || (await getMacSn());
    }
    // 自动备份
    try {
      MacMachineInfoUtils.backup(machineIdInfoPath);
    } catch { }
    MacMachineInfoUtils.writeMachineIdInfo(machineIdInfoPath, Buffer.from(machineId, 'hex'), snValue, key);
    const guid = MacMachineInfoUtils.computeGuid(Buffer.from(machineId, 'hex'), snValue);
    return sendSuccess(res, {
      message: 'machine_id set successfully',
      guid: guid.toString('hex'),
      guidUuid: MacMachineInfoUtils.guidToUuidStyle(guid),
    });
  } catch (e) {
    return sendError(res, `Failed to set machine_id: ${(e as Error).message}`);
  }
};

// macOS: machineid-info 备份列表
export const QQGetMacInfoBackupsHandler: RequestHandler = async (_, res) => {
  try {
    const dataPathGlobal = getGlobalDataPath(getQQDataPath());
    const backups = MacMachineInfoUtils.getBackups(MacMachineInfoUtils.getMachineIdInfoPath(dataPathGlobal));
    return sendSuccess(res, backups);
  } catch (e) {
    return sendError(res, `Failed to get backups: ${(e as Error).message}`);
  }
};

// macOS: 创建 machineid-info 备份
export const QQCreateMacInfoBackupHandler: RequestHandler = async (_, res) => {
  try {
    const dataPathGlobal = getGlobalDataPath(getQQDataPath());
    const backupPath = MacMachineInfoUtils.backup(MacMachineInfoUtils.getMachineIdInfoPath(dataPathGlobal));
    return sendSuccess(res, { message: 'Backup created', path: backupPath });
  } catch (e) {
    return sendError(res, `Failed to backup: ${(e as Error).message}`);
  }
};

// macOS: 恢复 machineid-info 备份
export const QQRestoreMacInfoBackupHandler: RequestHandler = async (req, res) => {
  const { backupName } = req.body;
  if (!backupName) {
    return sendError(res, 'Backup name is required');
  }
  try {
    const dataPathGlobal = getGlobalDataPath(getQQDataPath());
    MacMachineInfoUtils.restore(MacMachineInfoUtils.getMachineIdInfoPath(dataPathGlobal), backupName);
    return sendSuccess(res, { message: 'Restored successfully' });
  } catch (e) {
    return sendError(res, `Failed to restore: ${(e as Error).message}`);
  }
};

// macOS: 重置设备信息 (删除 machineid-info, 回退到 MAC)
export const QQResetMacDeviceIDHandler: RequestHandler = async (_, res) => {
  try {
    const dataPathGlobal = getGlobalDataPath(getQQDataPath());
    const machineIdInfoPath = MacMachineInfoUtils.getMachineIdInfoPath(dataPathGlobal);
    // 自动备份
    try {
      MacMachineInfoUtils.backup(machineIdInfoPath);
    } catch { }
    MacMachineInfoUtils.delete(machineIdInfoPath);
    return sendSuccess(res, { message: 'Device ID reset successfully (machineid-info deleted)' });
  } catch (e) {
    return sendError(res, `Failed to reset Device ID: ${(e as Error).message}`);
  }
};

// ============================================================
// OIDB 新设备 QR 验证
// ============================================================

// 获取新设备验证二维码 (通过 OIDB 接口)
export const QQGetNewDeviceQRCodeHandler: RequestHandler = async (_, res) => {
  const uin = getNapigConfig().account.id;
  const jumpUrl = WebUiDataRuntime.getLoginAttempt()?.jumpUrl;
  if (WebUiDataRuntime.getQQLoginPhase() !== 'device_verification') return sendError(res, '设备验证已失效');
  if (!uin || !jumpUrl) {
    return sendError(res, 'uin and jumpUrl are required');
  }

  // 从 jumpUrl 中提取参数
  // jumpUrl 格式: https://accounts.qq.com/safe/verify?...&uin-token=xxx&sig=yyy
  // sig -> str_dev_auth_token, uin-token -> str_uin_token
  const url = new URL(jumpUrl);
  const strDevAuthToken = url.searchParams.get('sig') || '';
  const strUinToken = url.searchParams.get('uin-token') || '';

  if (!strDevAuthToken || !strUinToken) {
    return sendError(res, 'Failed to get new device QR code: unable to extract sig/uin-token from jumpUrl');
  }

  const body = {
    str_dev_auth_token: strDevAuthToken,
    uint32_flag: 1,
    uint32_url_type: 0,
    str_uin_token: strUinToken,
    str_dev_type: 'Windows',
    str_dev_name: os.hostname() || 'DESKTOP-NAPCAT',
  };

  const result = await oidbRequest(uin, body);
  return sendSuccess(res, result);
};

// 轮询新设备验证二维码状态
export const QQPollNewDeviceQRHandler: RequestHandler = async (req, res) => {
  const uin = getNapigConfig().account.id;
  const { bytesToken } = req.body;
  if (WebUiDataRuntime.getQQLoginPhase() !== 'device_verification') return sendError(res, '设备验证已失效');
  if (!uin || !bytesToken) {
    return sendError(res, 'uin and bytesToken are required');
  }

  try {
    const body = {
      uint32_flag: 0,
      bytes_token: bytesToken, // base64 编码的 token
    };

    const result = await oidbRequest(uin, body);
    // result 应包含 uint32_guarantee_status:
    // 0 = 等待扫码, 3 = 已扫码, 1 = 已确认 (包含 str_nt_succ_token)
    return sendSuccess(res, result);
  } catch (e) {
    return sendError(res, `Failed to poll QR status: ${(e as Error).message}`);
  }
};
