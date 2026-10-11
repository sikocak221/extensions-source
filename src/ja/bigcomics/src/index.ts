import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class BigComics extends ComiciViewer {
  readonly name = 'Big Comics';
  readonly baseUrl = 'https://bigcomics.jp';
}

export default defineExtension({
  preferences: () => new BigComics().preferences(),
  createSource: () => new BigComics().toSource(),
});
