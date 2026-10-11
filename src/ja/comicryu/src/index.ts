import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class ComicRyu extends ComiciViewer {
  readonly name = 'Comic Ryu';
  readonly baseUrl = 'https://comic-ryu.jp';
}

export default defineExtension({
  preferences: () => new ComicRyu().preferences(),
  createSource: () => new ComicRyu().toSource(),
});
