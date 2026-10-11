import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class MangaSPA extends ComiciViewer {
  readonly name = 'Manga SPA';
  readonly baseUrl = 'https://mangaspa.nikkan-spa.jp';
}

export default defineExtension({
  preferences: () => new MangaSPA().preferences(),
  createSource: () => new MangaSPA().toSource(),
});
