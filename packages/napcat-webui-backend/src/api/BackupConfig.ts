import { RequestHandler } from 'express';
import { getNapigConfig } from 'napcat-common/src/config';
import { sendError } from '@/napcat-webui-backend/src/utils/response';

export const BackupExportConfigHandler: RequestHandler = (_, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="onebot.json"');
  return res.send(JSON.stringify(getNapigConfig().onebot, null, 2));
};

export const BackupImportConfigHandler: RequestHandler = (_, res) => {
  return sendError(res, 'CONFIG_MANAGED: edit napig.yaml and restart');
};
