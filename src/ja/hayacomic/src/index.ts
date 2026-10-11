import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class HAYAComic extends ComiciViewer {
  readonly name = 'HAYA Comic';
  readonly baseUrl = 'https://hayacomic.jp';
}

export default defineExtension({
  preferences: () => new HAYAComic().preferences(),
  createSource: () => new HAYAComic().toSource(),
});
