interface SelfInfo {
  uid: string;
  uin: string;
  nick: string;
}
export interface WebUiConfigType {
  host: string;
  port: number;
  accessControlMode?: 'none' | 'whitelist' | 'blacklist';
  ipWhitelist?: string[];
  ipBlacklist?: string[];
  enableXForwardedFor?: boolean;
}
export enum NapCatCoreWorkingEnv {
  Unknown = 0,
  Shell = 1,
  Framework = 2,
}

export interface RestartProcessOptions {
  sessionExpiredReason?: string;
  loginMethod?: 'auto' | 'qr';
}

export type QQLoginPhase =
  | 'logging_in'
  | 'captcha_required'
  | 'device_verification'
  | 'waiting_phone_confirm'
  | 'waiting_qrcode'
  | 'generating_qrcode'
  | 'qrcode_scanned'
  | 'qrcode_failed'
  | 'initializing'
  | 'ready'
  | 'offline'
  | 'reconnecting';

export interface LoginRuntimeType {
  workingEnv: NapCatCoreWorkingEnv;
  QQLoginStatus: boolean;
  QQLoginPhase: QQLoginPhase;
  QQQRCodeURL: string;
  QQLoginUin: string;
  QQLoginInfo: SelfInfo;
  QQLoginError: string;
  QQVersion: string;
  QQDataPath: string;
  onQQLoginStatusChange: (status: boolean) => Promise<void>;
  onRefreshQRCode: () => Promise<void>;
  OneBotContext: any | null; // OneBot 上下文，用于调试功能
  NapCatHelper: {
    onRestartProcessRequested: (options?: RestartProcessOptions) => Promise<{ result: boolean; message: string; }>;
  };
  NapCatVersion: string;
}

export default {};
