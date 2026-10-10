import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class TakeComic extends ComiciViewer {
  readonly name = 'TakeComic';
  readonly baseUrl = 'https://takecomic.jp';
}

export default defineExtension({
  preferences: () => new TakeComic().preferences(),
  createSource: () => new TakeComic().toSource(),
});
