import type { OneBotConfig } from '@/napcat-webui-backend/src/onebot/config';
export interface LoginListItem {
  uin: string;
  uid: string;
  nickName: string;
  faceUrl: string;
  facePath: string;
  loginType: 1; // 1是二维码登录？
  isQuickLogin: boolean; // 是否可以快速登录
  isAutoLogin: boolean; // 是否可以自动登录
}

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
}

export type QQLoginPhase =
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
  WebUiConfigQuickFunction: () => Promise<void>;
  OneBotContext: any | null; // OneBot 上下文，用于调试功能
  NapCatHelper: {
    onQuickLoginRequested: (uin: string) => Promise<{ result: boolean; message: string; needPhoneConfirm?: boolean; }>;
    onPasswordLoginRequested: (uin: string, passwordMd5: string) => Promise<{ result: boolean; message: string; needCaptcha?: boolean; proofWaterUrl?: string; needNewDevice?: boolean; jumpUrl?: string; newDevicePullQrCodeSig?: string; }>;
    onCaptchaLoginRequested: (uin: string, passwordMd5: string, ticket: string, randstr: string, sid: string) => Promise<{ result: boolean; message: string; needNewDevice?: boolean; jumpUrl?: string; newDevicePullQrCodeSig?: string; }>;
    onNewDeviceLoginRequested: (uin: string, passwordMd5: string, newDevicePullQrCodeSig: string) => Promise<{ result: boolean; message: string; needNewDevice?: boolean; jumpUrl?: string; newDevicePullQrCodeSig?: string; }>;
    onOB11ConfigChanged: (ob11: OneBotConfig) => Promise<void>;
    onRestartProcessRequested: (options?: RestartProcessOptions) => Promise<{ result: boolean; message: string; }>;
    QQLoginList: string[];
    NewQQLoginList: LoginListItem[];
  };
  NapCatVersion: string;
}

export default {};
