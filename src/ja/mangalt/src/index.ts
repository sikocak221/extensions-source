import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class Mangalt extends ComiciViewer {
  readonly name = 'Mangalt';
  readonly baseUrl = 'https://mangalt.jp';
}

export default defineExtension({
  preferences: () => new Mangalt().preferences(),
  createSource: () => new Mangalt().toSource(),
});
