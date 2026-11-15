import { serverRequest } from '@/utils/request';

export default class WebUIFont {
  public static async uploadWebUIFont (file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await serverRequest.post<ServerResponse<boolean>>(
      '/base/font/upload/webui',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return data.data;
  }

  public static async deleteWebUIFont () {
    const { data } = await serverRequest.post<ServerResponse<boolean>>(
      '/base/font/delete/webui'
    );
    return data.data;
  }

  public static async checkWebUIFontExists () {
    const { data } = await serverRequest.get<ServerResponse<boolean>>(
      '/base/font/exists/webui'
    );
    return data.data;
  }
}
