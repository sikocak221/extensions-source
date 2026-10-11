import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class MagKan extends ComiciViewer {
  readonly name = 'MagKan';
  readonly baseUrl = 'https://kansai.mag-garden.co.jp';
}

export default defineExtension({
  preferences: () => new MagKan().preferences(),
  createSource: () => new MagKan().toSource(),
});
