import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Komiktap extends MangaThemesia {
  readonly name = 'Komiktap';
  readonly baseUrl = 'https://komiktap.info';
}

export default defineExtension({
  createSource: () => new Komiktap().toSource(),
});
