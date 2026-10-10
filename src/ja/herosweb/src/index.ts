import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class HEROSWeb extends ComiciViewer {
  readonly name = "HERO'S Web";
  readonly baseUrl = 'https://heros-web.com';
}

export default defineExtension({
  preferences: () => new HEROSWeb().preferences(),
  createSource: () => new HEROSWeb().toSource(),
});
