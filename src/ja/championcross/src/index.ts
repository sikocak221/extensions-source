import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class ChampionCross extends ComiciViewer {
  readonly name = 'Champion Cross';
  readonly baseUrl = 'https://championcross.jp';
}

export default defineExtension({
  preferences: () => new ChampionCross().preferences(),
  createSource: () => new ChampionCross().toSource(),
});
