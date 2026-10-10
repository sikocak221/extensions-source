import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class MangaZegra extends ComiciViewer {
  readonly name = 'Manga Zegra';
  readonly baseUrl = 'https://manga-zegra.com';
}

export default defineExtension({
  preferences: () => new MangaZegra().preferences(),
  createSource: () => new MangaZegra().toSource(),
});
