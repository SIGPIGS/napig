import type { RequestHandler } from 'express';
import { getNapigConfig } from 'napcat-common/src/config';
import { sendError, sendSuccess } from '@/napcat-webui-backend/src/utils/response';

export const OB11GetConfigHandler: RequestHandler = (_, res) => {
  return sendSuccess(res, getNapigConfig().onebot);
};

export const OB11SetConfigHandler: RequestHandler = (_, res) => {
  return sendError(res, 'CONFIG_MANAGED: edit onebot in napig.yaml and restart');
};
