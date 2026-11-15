import { Router } from 'express';
import { getExternalAuthUser } from '../helper/ExternalAuth';
import { sendSuccess } from '../utils/response';

const router: Router = Router();
router.get('/session', (req, res) => {
  res.header('Cache-Control', 'no-store');
  return sendSuccess(res, { user: getExternalAuthUser(req) });
});

export { router as AuthRouter };
