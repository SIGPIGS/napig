/**
 * @file 所有路由的入口文件
 */

import { Router } from 'express';

import { OB11ConfigRouter } from '@/napcat-webui-backend/src/router/OB11Config';
import { sendSuccess } from '@/napcat-webui-backend/src/utils/response';

import { QQLoginRouter } from '@/napcat-webui-backend/src/router/QQLogin';
import { AuthRouter } from '@/napcat-webui-backend/src/router/auth';
import { LogRouter } from '@/napcat-webui-backend/src/router/Log';
import { BaseRouter } from '@/napcat-webui-backend/src/router/Base';
import { WebUIConfigRouter } from './WebUIConfig';
import DebugRouter from '@/napcat-webui-backend/src/api/Debug';
import { ProcessRouter } from './Process';
import { MirrorRouter } from './Mirror';
import { NapCatConfigRouter } from './NapCatConfig';

const router: Router = Router();

// router:测试用
router.all('/test', (_, res) => {
  return sendSuccess(res);
});
// router:基础信息相关路由
router.use('/base', BaseRouter);
// router:WebUI登录相关路由
router.use('/auth', AuthRouter);
// router:QQ登录相关路由
router.use('/QQLogin', QQLoginRouter);
// router:OB11配置相关路由
router.use('/OB11Config', OB11ConfigRouter);
// router:日志相关路由
router.use('/Log', LogRouter);
// router:WebUI配置相关路由
router.use('/WebUIConfig', WebUIConfigRouter);
// router:调试相关路由
router.use('/Debug', DebugRouter);
// router:进程管理相关路由
router.use('/Process', ProcessRouter);
// router:镜像管理相关路由
router.use('/Mirror', MirrorRouter);
// router:NapCat配置相关路由
router.use('/NapCatConfig', NapCatConfigRouter);

export { router as ALLRouter };
