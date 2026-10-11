import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class ComicGrowl extends ComiciViewer {
  readonly name = 'Comic Growl';
  readonly baseUrl = 'https://comic-growl.com';
}

export default defineExtension({
  preferences: () => new ComicGrowl().preferences(),
  createSource: () => new ComicGrowl().toSource(),
});
