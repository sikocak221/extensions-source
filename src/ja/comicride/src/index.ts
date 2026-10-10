import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class ComicRide extends ComiciViewer {
  readonly name = 'Comic Ride';
  readonly baseUrl = 'https://comicride.jp';
}

export default defineExtension({
  preferences: () => new ComicRide().preferences(),
  createSource: () => new ComicRide().toSource(),
});
