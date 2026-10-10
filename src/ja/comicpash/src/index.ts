import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class ComicPash extends ComiciViewer {
  readonly name = 'Comic Pash';
  readonly baseUrl = 'https://comicpash.jp';
}

export default defineExtension({
  preferences: () => new ComicPash().preferences(),
  createSource: () => new ComicPash().toSource(),
});
