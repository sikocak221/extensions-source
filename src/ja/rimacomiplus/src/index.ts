import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class RimacomiPlus extends ComiciViewer {
  readonly name = 'RimacomiPlus';
  readonly baseUrl = 'https://rimacomiplus.jp';
}

export default defineExtension({
  preferences: () => new RimacomiPlus().preferences(),
  createSource: () => new RimacomiPlus().toSource(),
});
