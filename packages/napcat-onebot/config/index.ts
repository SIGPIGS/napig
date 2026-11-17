import { getNapigConfig } from 'napcat-common/src/config';

export * from './config';

export class OB11ConfigLoader {
  readonly configData = getNapigConfig().onebot;
}
