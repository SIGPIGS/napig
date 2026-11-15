import { Router } from 'express';
import { GetThemeConfigHandler, GetNapCatVersion, QQVersionHandler, SetThemeConfigHandler } from '../api/BaseInfo';
import { StatusRealTimeHandler } from '@/napcat-webui-backend/src/api/Status';
import { GetProxyHandler } from '../api/Proxy';
import { UploadWebUIFontHandler, DeleteWebUIFontHandler, CheckWebUIFontExistHandler } from '../api/WebUIFont';

const router: Router = Router();
// router: 获取nc的package.json信息
router.get('/QQVersion', QQVersionHandler);
router.get('/GetNapCatVersion', GetNapCatVersion);
router.get('/GetSysStatusRealTime', StatusRealTimeHandler);
router.get('/proxy', GetProxyHandler);
router.get('/Theme', GetThemeConfigHandler);
router.post('/SetTheme', SetThemeConfigHandler);
router.post('/font/upload/webui', UploadWebUIFontHandler);
router.post('/font/delete/webui', DeleteWebUIFontHandler);
router.get('/font/exists/webui', CheckWebUIFontExistHandler);

export { router as BaseRouter };
