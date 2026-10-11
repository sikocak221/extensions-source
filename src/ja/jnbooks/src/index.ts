import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class JNBooks extends ComiciViewer {
  readonly name = 'J-N Books';
  readonly baseUrl = 'https://comic.j-nbooks.jp';
}

export default defineExtension({
  preferences: () => new JNBooks().preferences(),
  createSource: () => new JNBooks().toSource(),
});
