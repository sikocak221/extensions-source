import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class MangaBangComics extends ComiciViewer {
  readonly name = 'MangaBang Comics';
  readonly baseUrl = 'https://comics.manga-bang.com';
}

export default defineExtension({
  preferences: () => new MangaBangComics().preferences(),
  createSource: () => new MangaBangComics().toSource(),
});
