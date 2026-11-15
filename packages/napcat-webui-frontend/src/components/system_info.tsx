import { Card, CardBody, CardHeader } from '@heroui/card';
import { Spinner } from '@heroui/spinner';
import { useLocalStorage } from '@uidotdev/usehooks';
import { useRequest } from 'ahooks';
import clsx from 'clsx';
import { FaCircleInfo, FaQq } from 'react-icons/fa6';
import { IoLogoChrome, IoLogoOctocat } from 'react-icons/io5';
import { RiMacFill } from 'react-icons/ri';

import key from '@/const/key';
import WebUIManager from '@/controllers/webui_manager';

export interface SystemInfoItemProps {
  title: string;
  icon?: React.ReactNode;
  value?: React.ReactNode;
  hasBackground?: boolean;
}

const SystemInfoItem: React.FC<SystemInfoItemProps> = ({
  title,
  value = '--',
  icon,
  hasBackground = false,
}) => {
  return (
    <div
      className={clsx(
        'flex text-sm gap-3 py-2 items-baseline transition-colors',
        hasBackground ? 'text-white/90' : 'text-default-600 dark:text-gray-300'
      )}
    >
      <div className='text-lg opacity-70 self-center'>{icon}</div>
      <div className='w-24 font-medium'>{title}</div>
      <div className={clsx(
        'text-xs font-mono flex-1',
        hasBackground ? 'text-white/80' : 'text-default-500'
      )}
      >{value}
      </div>
    </div>
  );
};

interface NapCatVersionProps {
  hasBackground?: boolean;
}

const NapCatVersion: React.FC<NapCatVersionProps> = ({ hasBackground = false }) => {
  const {
    data: packageData,
    loading: packageLoading,
    error: packageError,
  } = useRequest(WebUIManager.GetNapCatVersion, {
    cacheKey: 'napcat-version',
    staleTime: 60 * 60 * 1000,
    cacheTime: 24 * 60 * 60 * 1000,
  });

  return (
    <SystemInfoItem
      title='Napig 构建'
      icon={<IoLogoOctocat className='text-xl' />}
      hasBackground={hasBackground}
      value={packageError ? `错误：${packageError.message}` : packageLoading ? <Spinner size='sm' /> : packageData?.version}
    />
  );
};

export interface SystemInfoProps {
  archInfo?: string;
}
const SystemInfo: React.FC<SystemInfoProps> = (props) => {
  const { archInfo } = props;
  const {
    data: qqVersionData,
    loading: qqVersionLoading,
    error: qqVersionError,
  } = useRequest(WebUIManager.getQQVersion, {
    cacheKey: 'qq-version',
    staleTime: 60 * 60 * 1000,
    cacheTime: 24 * 60 * 60 * 1000,
  });
  const [backgroundImage] = useLocalStorage<string>(key.backgroundImage, '');
  const hasBackground = !!backgroundImage;

  return (
    <Card className={clsx(
      'backdrop-blur-sm border border-white/40 dark:border-white/10 shadow-sm overflow-visible flex-1',
      hasBackground ? 'bg-white/10 dark:bg-black/10' : 'bg-white/60 dark:bg-black/40'
    )}
    >
      <CardHeader className={clsx(
        'pb-0 items-center gap-2 font-bold px-4 pt-4',
        hasBackground ? 'text-white drop-shadow-sm' : 'text-default-700 dark:text-white'
      )}
      >
        <FaCircleInfo className='text-lg opacity-80' />
        <span>系统信息</span>
      </CardHeader>
      <CardBody className='flex-1'>
        <div className='flex flex-col gap-2 justify-between h-full'>
          <NapCatVersion hasBackground={hasBackground} />
          <SystemInfoItem
            title='QQ 版本'
            icon={<FaQq className='text-lg' />}
            hasBackground={hasBackground}
            value={
              qqVersionError
                ? (
                  `错误：${qqVersionError.message}`
                )
                : qqVersionLoading
                  ? (
                    <Spinner size='sm' />
                  )
                  : (
                    qqVersionData
                  )
            }
          />
          <SystemInfoItem
            title='WebUI 版本'
            icon={<IoLogoChrome className='text-xl' />}
            value='Next'
            hasBackground={hasBackground}
          />
          <SystemInfoItem
            title='系统版本'
            icon={<RiMacFill className='text-xl' />}
            value={archInfo}
            hasBackground={hasBackground}
          />
        </div>
      </CardBody>
    </Card>
  );
};

export default SystemInfo;
