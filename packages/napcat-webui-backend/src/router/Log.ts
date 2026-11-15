import { Router } from 'express';
import {
  LogHandler,
  LogListHandler,
  LogRealTimeHandler,
} from '../api/Log';

const router: Router = Router();

// 日志相关路由
router.get('/GetLog', LogHandler);
router.get('/GetLogList', LogListHandler);
router.get('/GetLogRealTime', LogRealTimeHandler);

export { router as LogRouter };
