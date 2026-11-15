import type { RequestHandler } from 'express';
import { sendError, sendSuccess } from '../utils/response';
import { logSubscription, WebUiConfig } from '@/napcat-webui-backend/index';

// 日志脱敏函数
const sanitizeLog = (log: string): string => {
  // 脱敏 token 参数，将 token=xxx 替换为 token=***
  return log.replace(/token=[\w\d]+/gi, 'token=***');
};
// 日志记录
export const LogHandler: RequestHandler = async (req, res) => {
  const filename = req.query['id'];
  if (!filename || typeof filename !== 'string') {
    return sendError(res, 'ID不能为空');
  }

  if (filename.includes('..')) {
    return sendError(res, 'ID不合法');
  }
  const logContent = await WebUiConfig.GetLogContent(filename);
  const sanitizedLogContent = sanitizeLog(logContent);
  return sendSuccess(res, sanitizedLogContent);
};

// 日志列表
export const LogListHandler: RequestHandler = async (_, res) => {
  const logList = await WebUiConfig.GetLogsList();
  return sendSuccess(res, logList);
};

// 实时日志（SSE）
export const LogRealTimeHandler: RequestHandler = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  const listener = (log: string) => {
    try {
      const sanitizedLog = sanitizeLog(log);
      res.write(`data: ${sanitizedLog}\n\n`);
    } catch (error) {
      console.error('向客户端写入日志数据时出错:', error);
    }
  };
  logSubscription.subscribe(listener);
  req.on('close', () => {
    logSubscription.unsubscribe(listener);
  });
};
