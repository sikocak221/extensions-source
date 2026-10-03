import { type HtmlElement, type MangaDetails, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Komikindo extends MangaThemesia {
  readonly name = 'Komikindo';
  readonly baseUrl = 'https://1.komikindo.shop';

  override hasProjectPage = true;

  override imageHeaders(): Record<string, string> {
    return {
      ...super.imageHeaders(),
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-site',
    };
  }

  // Some covers fail to load without a resize parameter.
  override mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details = super.mangaDetailsParse(document, manga);
    const thumbnail = details.thumbnailUrl;
    if (thumbnail && !/[?&]resize=/.test(thumbnail)) {
      details.thumbnailUrl = `${thumbnail}${thumbnail.includes('?') ? '&' : '?'}resize=165,225`;
    }
    return details;
  }
}

export default defineExtension({
  createSource: () => new Komikindo().toSource(),
});
