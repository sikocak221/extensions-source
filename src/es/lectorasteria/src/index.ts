import { type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { MoonlightTL } from './moonlighttl/MoonlightTL';

class LectorAsteria extends MoonlightTL {
  readonly name = 'Lector Asteria';
  readonly baseUrl = 'https://visor.chifa-tong.online';
  readonly lang = 'es';
  override async pageListParse(document: HtmlElement): Promise<Page[]> {
    return document
      .select('main > div > img.block')
      .map((img, index) => ({ index, imageUrl: img.absUrl('src') ?? '' }));
  }
}

export default defineExtension({
  createSource: () => new LectorAsteria().toSource(),
});
