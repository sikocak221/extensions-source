import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class ComicRoomBase extends ComiciViewer {
  readonly name = 'Comic Room Base';
  readonly baseUrl = 'https://comic-room-base.com';
}

export default defineExtension({
  preferences: () => new ComicRoomBase().preferences(),
  createSource: () => new ComicRoomBase().toSource(),
});
