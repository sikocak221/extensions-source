import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class YoungChampion extends ComiciViewer {
  readonly name = 'Young Champion';
  readonly baseUrl = 'https://youngchampion.jp';
}

export default defineExtension({
  preferences: () => new YoungChampion().preferences(),
  createSource: () => new YoungChampion().toSource(),
});
