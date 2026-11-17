import { Button } from '@heroui/button';
import toast from 'react-hot-toast';
import { LuDownload } from 'react-icons/lu';
import { requestServerWithFetch } from '@/utils/request';

// 导出配置
const handleExportConfig = async () => {
  try {
    const response = await requestServerWithFetch('/OB11Config/ExportConfig', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('导出配置失败');
    }

    // 创建下载链接
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = response.headers.get('Content-Disposition')?.split('=')[1]?.replace(/"/g, '') || 'onebot.json';
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast.success('配置导出成功');
  } catch (error) {
    const msg = (error as Error).message;

    toast.error(`导出配置失败: ${msg}`);
  }
};

const BackupConfigCard: React.FC = () => (
  <div className='space-y-4'>
    <h3 className='text-lg font-medium'>导出 OneBot 配置</h3>
    <p className='text-sm text-default-500'>
      导出当前生效的 OneBot 配置（含连接 token）。完整配置请备份部署中的 napig.yaml；修改后重启生效。
    </p>
    <Button onPress={handleExportConfig} startContent={<LuDownload size={20} />}>
      下载 onebot.json
    </Button>
  </div>
);

export default BackupConfigCard;
