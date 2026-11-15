import { useLocalStorage } from '@uidotdev/usehooks';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

import key from '@/const/key';

import SaveButtons from '@/components/button/save_buttons';
import ImageInput from '@/components/input/image_input';

import { siteConfig } from '@/config/site';

const WebUIConfigCard = () => {
  const {
    control,
    handleSubmit: handleWebuiSubmit,
    formState: { isSubmitting },
    setValue: setWebuiValue,
  } = useForm({
    defaultValues: {
      background: '',
      customIcons: {} as Record<string, string>,
    },
  });

  const [b64img, setB64img] = useLocalStorage(key.backgroundImage, '');
  const [customIcons, setCustomIcons] = useLocalStorage<Record<string, string>>(
    key.customIcons,
    {}
  );
  const reset = () => {
    setWebuiValue('customIcons', customIcons);
    setWebuiValue('background', b64img);
  };

  const onSubmit = handleWebuiSubmit((data) => {
    try {
      setCustomIcons(data.customIcons);
      setB64img(data.background);
      toast.success('保存成功');
    } catch (error) {
      const msg = (error as Error).message;
      toast.error(`保存失败: ${msg}`);
    }
  });

  useEffect(() => {
    reset();
  }, [customIcons, b64img]);

  return (
    <>
      <title>WebUI配置 - NapCat WebUI</title>

      <div className='flex flex-col gap-2'>
        <div className='flex-shrink-0 w-full font-bold text-default-600 dark:text-default-400 px-1'>背景图</div>
        <Controller
          control={control}
          name='background'
          render={({ field }) => (
            <ImageInput
              {...field}
            />
          )}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <div className='flex-shrink-0 w-full font-bold text-default-600 dark:text-default-400 px-1'>自定义图标</div>
        {siteConfig.navItems.map((item) => (
          <Controller
            key={item.label}
            control={control}
            name={`customIcons.${item.label}`}
            render={({ field }) => (
              <ImageInput
                {...field}
                label={item.label}
              />
            )}
          />
        ))}
      </div>
      <SaveButtons
        onSubmit={onSubmit}
        reset={reset}
        isSubmitting={isSubmitting}
      />
    </>
  );
};

export default WebUIConfigCard;
