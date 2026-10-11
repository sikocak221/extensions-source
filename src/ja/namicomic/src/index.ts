import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class NamiComic extends ComiciViewer {
  readonly name = 'Nami Comic';
  readonly baseUrl = 'https://namicomic.jp';
}

export default defineExtension({
  preferences: () => new NamiComic().preferences(),
  createSource: () => new NamiComic().toSource(),
});
