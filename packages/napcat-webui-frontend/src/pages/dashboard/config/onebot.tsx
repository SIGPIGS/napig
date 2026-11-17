import { useEffect } from 'react';
import toast from 'react-hot-toast';
import useConfig from '@/hooks/use-config';

export default function OneBotConfigCard () {
  const { config, refreshConfig } = useConfig();
  useEffect(() => { refreshConfig().catch(error => toast.error(error.message)); }, []);
  const { network: _network, ...options } = config;
  return (
    <>
      <title>OneBot配置 - NapCat WebUI</title>
      <p>OneBot 配置由 napig.yaml 管理，修改后重启生效。</p>
      <pre className='overflow-auto text-sm'>{JSON.stringify(options, null, 2)}</pre>
    </>
  );
}
