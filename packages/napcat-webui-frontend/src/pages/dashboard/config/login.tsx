import { useRequest } from 'ahooks';
import GUIDManager from '@/components/guid_manager';
import QQManager from '@/controllers/qq_manager';

export default function LoginConfigCard () {
  const { data } = useRequest(QQManager.checkQQLoginStatus);
  return (
    <div className='space-y-4'>
      <p>配置账号：{data?.account || '读取中…'}</p>
      <p className='text-sm text-default-500'>此实例自动维护该账号在线。账号及密码在 napig.yaml 中配置，修改后重启生效。</p>
      <GUIDManager showRestart />
    </div>
  );
}
