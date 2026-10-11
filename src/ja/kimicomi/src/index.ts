import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class KimiComi extends ComiciViewer {
  readonly name = 'KimiComi';
  readonly baseUrl = 'https://kimicomi.com';
}

export default defineExtension({
  preferences: () => new KimiComi().preferences(),
  createSource: () => new KimiComi().toSource(),
});
