import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class Asacomi extends ComiciViewer {
  readonly name = 'Asacomi';
  readonly baseUrl = 'https://asacomi.jp';
}

export default defineExtension({
  preferences: () => new Asacomi().preferences(),
  createSource: () => new Asacomi().toSource(),
});
