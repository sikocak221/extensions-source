import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class BibibiComic extends ComiciViewer {
  readonly name = 'Bibibi Comic';
  readonly baseUrl = 'https://bibibi-comic.com';
}

export default defineExtension({
  preferences: () => new BibibiComic().preferences(),
  createSource: () => new BibibiComic().toSource(),
});
