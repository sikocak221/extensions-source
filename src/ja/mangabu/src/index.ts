import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class MangaBu extends ComiciViewer {
  readonly name = 'MangaBu';
  readonly baseUrl = 'https://mangabu.jp';
}

export default defineExtension({
  preferences: () => new MangaBu().preferences(),
  createSource: () => new MangaBu().toSource(),
});
