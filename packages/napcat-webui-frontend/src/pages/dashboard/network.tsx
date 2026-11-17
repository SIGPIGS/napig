import { Button } from '@heroui/button';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useConfig from '@/hooks/use-config';

// Retained for shared display-card components.
export interface SectionProps {
  title: string;
  color?: 'violet' | 'yellow' | 'blue' | 'cyan' | 'green' | 'pink' | 'foreground';
  icon: React.ReactNode;
  children: React.ReactNode;
}
export interface EmptySectionProps { isEmpty: boolean; }

export default function NetworkPage () {
  const { config, refreshConfig } = useConfig();
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try { await refreshConfig(); } catch (error) { toast.error((error as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  return (
    <section className='w-full max-w-5xl mx-auto p-6 space-y-4'>
      <title>网络配置 - NapCat WebUI</title>
      <h1 className='text-xl'>OneBot 网络配置</h1>
      <p>网络配置由 napig.yaml 管理，修改后重启生效。</p>
      <Button onPress={refresh} isLoading={loading}>刷新</Button>
      <pre className='overflow-auto text-sm'>{JSON.stringify(config.network, null, 2)}</pre>
    </section>
  );
}
