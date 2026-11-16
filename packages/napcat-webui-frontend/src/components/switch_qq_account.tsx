import { Button } from '@heroui/button';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import QQManager from '@/controllers/qq_manager';
import useDialog from '@/hooks/use-dialog';

export default function SwitchQQAccount ({ retry = false }: { retry?: boolean; }) {
  const dialog = useDialog();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const logout = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await QQManager.logout();
      navigate('/qq_login', { replace: true, state: { accountSwitching: true } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退出 QQ 失败');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Button
      variant='flat'
      isLoading={busy}
      onPress={() => {
        if (retry) {
          logout();
          return;
        }
        dialog.confirm({
          title: '退出 QQ / 切换账号',
          content: '退出当前 QQ 并返回扫码登录页。账号数据和网络配置会保留，WebUI 登录和启动时的自动登录账号设置不变。',
          confirmText: '退出 QQ',
          onConfirm: logout,
        });
      }}
    >
      {retry ? '重试退出 QQ' : '退出 QQ / 切换账号'}
    </Button>
  );
}
