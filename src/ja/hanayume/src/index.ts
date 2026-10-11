import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class HanaToYume extends ComiciViewer {
  readonly name = 'Hana To Yume+';
  readonly baseUrl = 'https://hanayume.com';
}

export default defineExtension({
  preferences: () => new HanaToYume().preferences(),
  createSource: () => new HanaToYume().toSource(),
});
