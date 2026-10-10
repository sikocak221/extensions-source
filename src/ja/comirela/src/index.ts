import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class Comirela extends ComiciViewer {
  readonly name = 'Comirela';
  readonly baseUrl = 'https://comirela.com';
}

export default defineExtension({
  preferences: () => new Comirela().preferences(),
  createSource: () => new Comirela().toSource(),
});
