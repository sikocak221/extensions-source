import { type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class YonaBar extends Madara {
  readonly name = 'Yona Bar';
  readonly baseUrl = 'https://yonaber.com';

  override mangaSubString = 'yaoi';
  override parsePages(document: HtmlElement): Page[] {
    return super.parsePages(document).map((page) => ({
      ...page,
      imageUrl: page.imageUrl?.replace('medium1', 'medium1xr').replace('medium2', 'medium2x'),
    }));
  }
  override pageListParseSelector = '.reading-content img:not(#image-0\\.0)';
}

export default defineExtension({
  createSource: () => new YonaBar().toSource(),
});
