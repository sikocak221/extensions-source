import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class TsundokuTradues extends MangaThemesia {
  readonly name = 'Tsundoku Traduções';
  readonly baseUrl = 'https://tsundoku.com.br';

  override altNamePrefix = 'Nome alternativo: ';
  override searchMangaSelector(): string {
    return '.utao .uta .imgu, .listupd .bs .bsx:not(:has(span.novelabel)), .listo .bs .bsx:not(:has(span.novelabel))';
  }
}

export default defineExtension({
  createSource: () => new TsundokuTradues().toSource(),
});
