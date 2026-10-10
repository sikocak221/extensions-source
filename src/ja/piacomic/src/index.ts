import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class PiaComic extends ComiciViewer {
  readonly name = 'PiaComic';
  readonly baseUrl = 'https://piacomic.jp';
}

export default defineExtension({
  preferences: () => new PiaComic().preferences(),
  createSource: () => new PiaComic().toSource(),
});
