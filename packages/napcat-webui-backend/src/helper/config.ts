import { getNapigConfig } from 'napcat-common/src/config';
import { webUiPathWrapper } from '@/napcat-webui-backend/index';
import { Type, Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import fs, { constants } from 'node:fs/promises';

import { resolve } from 'node:path';

import { themeType } from '../types/theme';

// 定义配置的类型
const WebUiConfigSchema = Type.Object({
  host: Type.String({ default: '::' }),
  port: Type.Number({ default: 6099 }),
  theme: themeType,
  // 是否关闭WebUI
  disableWebUI: Type.Boolean({ default: false }),
  // 网络访问控制模式: 'none' | 'whitelist' | 'blacklist'
  accessControlMode: Type.Union([
    Type.Literal('none'),
    Type.Literal('whitelist'),
    Type.Literal('blacklist'),
  ], { default: 'none' }),
  // IP白名单列表
  ipWhitelist: Type.Array(Type.String(), { default: [] }),
  // IP黑名单列表
  ipBlacklist: Type.Array(Type.String(), { default: [] }),
  // 是否启用 X-Forwarded-For 获取真实IP
  enableXForwardedFor: Type.Boolean({ default: false }),
});

export type WebUiConfigType = Static<typeof WebUiConfigSchema>;

// Service fields come from YAML; webui.json stores writable theme preferences.
export class WebUiConfigWrapper {
  WebUiConfigData: WebUiConfigType | undefined = undefined;

  async GetWebUIConfig (): Promise<WebUiConfigType> {
    if (this.WebUiConfigData) return this.WebUiConfigData;
    const declared = getNapigConfig();
    let theme;
    try {
      const stored = JSON.parse(await fs.readFile(resolve(webUiPathWrapper.configPath, 'webui.json'), 'utf8'));
      theme = stored.theme;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.WebUiConfigData = Value.Default(WebUiConfigSchema, {
      host: declared.webui.host,
      port: declared.webui.port,
      disableWebUI: !declared.webui.enabled,
      accessControlMode: declared.webui.accessControlMode,
      ipWhitelist: declared.webui.ipWhitelist,
      ipBlacklist: declared.webui.ipBlacklist,
      enableXForwardedFor: declared.webui.enableXForwardedFor,
      theme,
    }) as WebUiConfigType;
    return this.WebUiConfigData;
  }

  async UpdateWebUIConfig (newConfig: Partial<WebUiConfigType>): Promise<void> {
    if (Object.keys(newConfig).some(key => key !== 'theme')) {
      throw new Error('CONFIG_MANAGED: edit webui in napig.yaml and restart');
    }
    const current = await this.GetWebUIConfig();
    const theme = Value.Parse(themeType, newConfig.theme ?? current.theme) as WebUiConfigType['theme'];
    const filename = resolve(webUiPathWrapper.configPath, 'webui.json');
    let stored = {};
    try { stored = JSON.parse(await fs.readFile(filename, 'utf8')); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.writeFile(filename, JSON.stringify({ ...stored, theme }, null, 2));
    this.WebUiConfigData = { ...current, theme };
  }

  // 获取日志文件夹路径
  async GetLogsPath (): Promise<string> {
    return resolve(webUiPathWrapper.logsPath);
  }

  // 获取日志列表
  async GetLogsList (): Promise<string[]> {
    const logsPath = resolve(webUiPathWrapper.logsPath);
    const logsExist = await fs
      .access(logsPath, constants.F_OK)
      .then(() => true)
      .catch(() => false);
    if (logsExist) {
      return (await fs.readdir(logsPath))
        .filter((file) => file.endsWith('.log'))
        .map((file) => file.replace('.log', ''));
    }
    return [];
  }

  // 获取指定日志文件内容
  async GetLogContent (filename: string): Promise<string> {
    const logPath = resolve(webUiPathWrapper.logsPath, `${filename}.log`);
    const logExists = await fs
      .access(logPath, constants.R_OK)
      .then(() => true)
      .catch(() => false);
    if (logExists) {
      return await fs.readFile(logPath, 'utf-8');
    }
    return '';
  }

  // 获取字体文件夹内的字体列表
  async GetFontList (): Promise<string[]> {
    const fontsPath = resolve(webUiPathWrapper.configPath, './fonts');
    const fontsExist = await fs
      .access(fontsPath, constants.F_OK)
      .then(() => true)
      .catch(() => false);
    if (fontsExist) {
      return (await fs.readdir(fontsPath)).filter((file) => file.endsWith('.ttf'));
    }
    return [];
  }

  // 判断字体是否存在（支持多种格式）
  async CheckWebUIFontExist (): Promise<boolean> {
    const fontPath = await this.GetWebUIFontPath();
    if (!fontPath) return false;
    return await fs
      .access(fontPath, constants.F_OK)
      .then(() => true)
      .catch(() => false);
  }

  // 获取webui字体文件路径（支持多种格式）
  async GetWebUIFontPath (): Promise<string | null> {
    const fontsPath = resolve(webUiPathWrapper.configPath, './fonts');
    const extensions = ['.woff', '.woff2', '.ttf', '.otf'];
    for (const ext of extensions) {
      const fontPath = resolve(fontsPath, `webui${ext}`);
      const exists = await fs
        .access(fontPath, constants.F_OK)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        return fontPath;
      }
    }
    return null;
  }

  // 同步版本，用于 multer 配置
  GetWebUIFontPathSync (): string {
    return resolve(webUiPathWrapper.configPath, './fonts/webui.woff');
  }

  // 获取主题内容
  async GetTheme (): Promise<WebUiConfigType['theme']> {
    const config = await this.GetWebUIConfig();

    return config.theme;
  }

  // 更新主题内容
  async UpdateTheme (theme: WebUiConfigType['theme']): Promise<void> {
    await this.UpdateWebUIConfig({ theme });
  }

  // 获取是否禁用WebUI
  async GetDisableWebUI (): Promise<boolean> {
    const config = await this.GetWebUIConfig();
    return config.disableWebUI;
  }

  // 获取访问控制模式
  async GetAccessControlMode (): Promise<'none' | 'whitelist' | 'blacklist'> {
    const config = await this.GetWebUIConfig();
    return config.accessControlMode;
  }

  // 获取IP白名单
  async GetIpWhitelist (): Promise<string[]> {
    const config = await this.GetWebUIConfig();
    return config.ipWhitelist;
  }

  // 获取IP黑名单
  async GetIpBlacklist (): Promise<string[]> {
    const config = await this.GetWebUIConfig();
    return config.ipBlacklist;
  }

  // 获取是否启用 X-Forwarded-For
  async GetEnableXForwardedFor (): Promise<boolean> {
    const config = await this.GetWebUIConfig();
    return config.enableXForwardedFor || false;
  }
}
