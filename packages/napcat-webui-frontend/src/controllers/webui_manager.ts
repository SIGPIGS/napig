import { EventSourcePolyfill } from 'event-source-polyfill';

import { LogLevel } from '@/const/enum';

import { serverRequest } from '@/utils/request';
import { checkSessionAfterDisconnect } from '@/utils/auth';

export interface Log {
  level: LogLevel;
  message: string;
}

export default class WebUIManager {
  public static async proxy<T> (url = '') {
    const data = await serverRequest.get<ServerResponse<string>>(
      '/base/proxy?url=' + encodeURIComponent(url)
    );
    data.data.data = JSON.parse(data.data.data);
    return data.data as ServerResponse<T>;
  }

  public static async GetNapCatVersion () {
    const { data } =
      await serverRequest.get<ServerResponse<PackageInfo>>('/base/GetNapCatVersion');
    return data.data;
  }

  public static async getQQVersion () {
    const { data } =
      await serverRequest.get<ServerResponse<string>>('/base/QQVersion');
    return data.data;
  }

  public static async getThemeConfig () {
    const { data } =
      await serverRequest.get<ServerResponse<ThemeConfig>>('/base/Theme');
    return data.data;
  }

  public static async setThemeConfig (theme: ThemeConfig) {
    const { data } = await serverRequest.post<ServerResponse<boolean>>(
      '/base/SetTheme',
      { theme }
    );
    return data.data;
  }

  public static async restart () {
    const { data } = await serverRequest.post<ServerResponse<any>>('/Process/Restart');
    return data.data;
  }

  public static async getLogList () {
    const { data } =
      await serverRequest.get<ServerResponse<string[]>>('/Log/GetLogList');
    return data.data;
  }

  public static async getLogContent (logName: string) {
    const { data } = await serverRequest.get<ServerResponse<string>>(
      `/Log/GetLog?id=${logName}`
    );
    return data.data;
  }

  public static getRealTimeLogs (writer: (data: Log[]) => void) {
    const eventSource = new EventSourcePolyfill('/api/Log/GetLogRealTime', {
      headers: {
        Accept: 'text/event-stream, application/json',
      },
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        data.message = data.message.replace(/\n/g, '\r\n');
        writer([data]);
      } catch (error) {
        console.error(error);
      }
    };

    eventSource.onerror = (error) => {
      checkSessionAfterDisconnect();
      console.error('SSE连接出错:', error);
      eventSource.close();
    };

    return eventSource;
  }

  public static getSystemStatus (writer: (data: SystemStatus) => void) {
    const eventSource = new EventSourcePolyfill(
      '/api/base/GetSysStatusRealTime',
      {
        headers: {
          Accept: 'text/event-stream, application/json',
        },
        withCredentials: true,
      }
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SystemStatus;
        writer(data);
      } catch (error) {
        console.error(error);
      }
    };

    eventSource.onerror = (error) => {
      checkSessionAfterDisconnect();
      console.error('SSE连接出错:', error);
      eventSource.close();
    };

    return eventSource;
  }

  // 获取WebUI基础配置
  public static async getWebUIConfig () {
    const { data } = await serverRequest.get<ServerResponse<WebUIConfig>>(
      '/WebUIConfig/GetConfig'
    );
    return data.data;
  }

  // 更新WebUI基础配置
  public static async updateWebUIConfig (config: Partial<WebUIConfig>) {
    const { data } = await serverRequest.post<ServerResponse<boolean>>(
      '/WebUIConfig/UpdateConfig',
      config
    );
    return data.data;
  }

  // 获取是否禁用WebUI
  public static async getDisableWebUI () {
    const { data } = await serverRequest.get<ServerResponse<boolean>>(
      '/WebUIConfig/GetDisableWebUI'
    );
    return data.data;
  }

  // 更新是否禁用WebUI
  public static async updateDisableWebUI (disable: boolean) {
    const { data } = await serverRequest.post<ServerResponse<boolean>>(
      '/WebUIConfig/UpdateDisableWebUI',
      { disable }
    );
    return data.data;
  }

  // 获取当前客户端IP
  public static async getClientIP () {
    const { data } = await serverRequest.get<ServerResponse<{ ip: string; }>>(
      '/WebUIConfig/GetClientIP'
    );
    return data.data;
  }

  // 获取SSL证书状态
  public static async getSSLStatus () {
    const { data } = await serverRequest.get<ServerResponse<{
      enabled: boolean;
      certExists: boolean;
      keyExists: boolean;
      certContent: string;
      keyContent: string;
    }>>('/WebUIConfig/GetSSLStatus');
    return data.data;
  }

  // 保存SSL证书
  public static async saveSSLCert (cert: string, key: string) {
    const { data } = await serverRequest.post<ServerResponse<{ message: string; }>>(
      '/WebUIConfig/UploadSSLCert',
      { cert, key }
    );
    return data.data;
  }

  // 删除SSL证书
  public static async deleteSSLCert () {
    const { data } = await serverRequest.post<ServerResponse<{ message: string; }>>(
      '/WebUIConfig/DeleteSSLCert'
    );
    return data.data;
  }
}
