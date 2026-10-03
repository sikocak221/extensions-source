import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Toonizy extends Madara {
  readonly name = 'Toonizy';
  readonly baseUrl = 'https://toonizy.com';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Toonizy().toSource(),
});
