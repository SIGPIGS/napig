import type { RequestHandler } from 'express';
import { sendError, sendSuccess } from '../utils/response';
import fsProm from 'node:fs/promises';
import multer from 'multer';
import webUIFontUploader from '../uploader/webui_font';
import { WebUiConfig } from '@/napcat-webui-backend/index';

// 上传WebUI字体文件处理方法
export const UploadWebUIFontHandler: RequestHandler = async (req, res) => {
  try {
    await webUIFontUploader(req, res);
    return sendSuccess(res, true, '字体文件上传成功', true);
  } catch (error) {
    let errorMessage = '字体文件上传失败';

    if (error instanceof multer.MulterError) {
      switch (error.code) {
        case 'LIMIT_FILE_SIZE':
          errorMessage = '字体文件大小超过限制（40MB）';
          break;
        case 'LIMIT_UNEXPECTED_FILE':
          errorMessage = '无效的文件上传字段';
          break;
        default:
          errorMessage = `上传错误: ${error.message}`;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return sendError(res, errorMessage, true);
  }
};

// 删除WebUI字体文件处理方法
export const DeleteWebUIFontHandler: RequestHandler = async (_req, res) => {
  try {
    const fontPath = await WebUiConfig.GetWebUIFontPath();
    const exists = await WebUiConfig.CheckWebUIFontExist();

    if (!exists || !fontPath) {
      return sendSuccess(res, true);
    }

    await fsProm.unlink(fontPath);
    return sendSuccess(res, true);
  } catch (_error) {
    return sendError(res, '删除字体文件失败');
  }
};

// 检查WebUI字体文件是否存在
export const CheckWebUIFontExistHandler: RequestHandler = async (_req, res) => {
  try {
    const exists = await WebUiConfig.CheckWebUIFontExist();
    return sendSuccess(res, exists);
  } catch (_error) {
    return sendError(res, '检查字体文件失败');
  }
};
