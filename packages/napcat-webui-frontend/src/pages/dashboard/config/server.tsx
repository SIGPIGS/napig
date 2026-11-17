import { useRequest } from 'ahooks';
import PageLoading from '@/components/page_loading';
import WebUIManager from '@/controllers/webui_manager';

export default function ServerConfigCard () {
  const { data, loading, error } = useRequest(WebUIManager.getWebUIConfig);
  if (loading) return <PageLoading loading />;
  return (
    <>
      <title>服务器配置 - NapCat WebUI</title>
      <p>服务配置由 napig.yaml 管理，修改后重启生效。</p>
      {error ? <p>{error.message}</p> : <pre className='overflow-auto text-sm'>{JSON.stringify(data, null, 2)}</pre>}
    </>
  );
}
