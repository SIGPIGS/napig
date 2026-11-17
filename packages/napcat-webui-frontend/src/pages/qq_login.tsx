import { Button } from '@heroui/button';
import { CardBody, CardHeader } from '@heroui/card';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { signOut } from '@/utils/auth';
import GUIDManager from '@/components/guid_manager';
import Modal from '@/components/modal';
import HoverEffectCard from '@/components/effect_card';
import { ThemeSwitch } from '@/components/theme-switch';
import TencentCaptchaModal, { type CaptchaCallbackData } from '@/components/tencent_captcha';
import NewDeviceVerify from '@/components/new_device_verify';
import QQManager from '@/controllers/qq_manager';
import PureLayout from '@/layouts/pure';

type Status = Awaited<ReturnType<typeof QQManager.checkQQLoginStatusWithQrcode>>;
const phaseText: Record<string, string> = {
  logging_in: '正在登录，等待 QQ 确认…',
  waiting_phone_confirm: '请在手机 QQ 上确认登录',
  waiting_qrcode: '请用配置中的 QQ 账号扫描二维码',
  generating_qrcode: '正在获取二维码…',
  qrcode_scanned: '二维码已扫描，请在手机上确认',
  captcha_required: '密码登录需要完成验证码',
  device_verification: '密码登录需要完成设备验证',
  initializing: 'QQ 已登录，正在启动服务…',
  ready: 'QQ 已在线',
  offline: 'QQ 当前离线',
  reconnecting: '正在连接 QQ 登录服务…',
  qrcode_failed: '本次扫码未完成，请重新扫码',
};

export default function QQLoginPage () {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [showGUIDManager, setShowGUIDManager] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const attemptId = status?.attempt?.id;
  const refresh = useCallback(async () => {
    const next = await QQManager.checkQQLoginStatusWithQrcode();
    setStatus(next);
    setUnavailable(false);
    if (next.isLogin) navigate('/', { replace: true });
  }, [navigate]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(); } catch { if (!stopped) setUnavailable(true); }
      if (!stopped) timer = setTimeout(poll, 1500);
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [refresh]);
  useEffect(() => { setShowCaptcha(status?.loginPhase === 'captcha_required'); }, [attemptId, status?.loginPhase]);
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await refresh(); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  }, [refresh]);
  const captchaSuccess = useCallback((data: CaptchaCallbackData) => {
    setShowCaptcha(false);
    if (attemptId) run(() => QQManager.captchaLogin(attemptId, data.ticket, data.randstr, data.sid));
  }, [attemptId, run]);
  const deviceSuccess = useCallback((token: string) => {
    if (attemptId) run(() => QQManager.newDeviceLogin(attemptId, token));
  }, [attemptId, run]);
  const captchaCancel = useCallback(() => setShowCaptcha(false), []);
  return (
    <PureLayout>
      <HoverEffectCard className='w-full max-w-lg mx-auto'>
        <CardHeader className='flex justify-between'>
          <h1 className='text-xl font-bold'>QQ 登录</h1>
          <ThemeSwitch />
        </CardHeader>
        <CardBody className='flex flex-col items-center gap-5'>
          <p>配置账号：<strong>{status?.account || '读取中…'}</strong></p>
          <p className='text-default-600'>{unavailable ? '正在等待服务恢复…' : phaseText[status?.loginPhase || 'reconnecting']}</p>
          {status?.loginError && <p className='text-warning text-sm whitespace-pre-wrap'>{status.loginError}</p>}
          {status?.qrcodeurl && ['waiting_qrcode', 'qrcode_scanned'].includes(status.loginPhase || '') && (
            <div className='bg-white p-3 rounded'><QRCodeSVG value={status.qrcodeurl} size={200} /></div>
          )}
          {status?.loginPhase === 'captcha_required' && status.attempt?.proofWaterUrl && (
            <>
              {showCaptcha && <TencentCaptchaModal proofWaterUrl={status.attempt.proofWaterUrl} onSuccess={captchaSuccess} onCancel={captchaCancel} />}
              <Button onPress={() => setShowCaptcha(true)} isDisabled={busy}>打开验证码</Button>
            </>
          )}
          {status?.loginPhase === 'device_verification' && status.attempt?.jumpUrl && (
            <NewDeviceVerify key={attemptId} uin={status.account} jumpUrl={status.attempt.jumpUrl} onVerified={deviceSuccess} />
          )}
          <div className='flex gap-3'>
            <Button color='primary' isLoading={busy} isDisabled={unavailable || busy} onPress={() => run(() => QQManager.login('auto'))}>登录配置账号</Button>
            <Button isDisabled={unavailable || busy} onPress={() => run(() => QQManager.login('qr'))}>重新扫码</Button>
          </div>
          <p className='text-xs text-default-500'>登录账号及密码由配置文件管理；需要手机确认或验证码时，可在这里继续完成。</p>
          <Button variant='light' onPress={() => setShowGUIDManager(true)}>设备 GUID 管理</Button>
          <Button variant='light' onPress={signOut}>退出 WebUI</Button>
        </CardBody>
      </HoverEffectCard>
      {showGUIDManager && <Modal title='设备 GUID 管理' content={<GUIDManager compact showRestart />} size='lg' hideFooter onClose={() => setShowGUIDManager(false)} />}
    </PureLayout>
  );
}
