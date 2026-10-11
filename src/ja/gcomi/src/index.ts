import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class GComi extends ComiciViewer {
  readonly name = 'G-Comi';
  readonly baseUrl = 'https://g-comi.jp';
}

export default defineExtension({
  preferences: () => new GComi().preferences(),
  createSource: () => new GComi().toSource(),
});
