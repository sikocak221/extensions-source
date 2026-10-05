import type { Chapter, HtmlElement, MangaSummary } from '@matane/extension-sdk';
import { defineExtension } from '@matane/extension-sdk';
import { type SelectOption, ManhwaZ } from './manhwaz/ManhwaZ';
import { absoluteUrl, relativeUrl } from './manhwaz/utils';

class SayHentai extends ManhwaZ {
  readonly name = 'SayHentai';
  readonly baseUrl = 'https://sayhentai.cx';

  override lang = 'vi' as const;
  override mangaDetailsAuthorHeading = 'Tác giả';
  override mangaDetailsStatusHeading = 'Trạng thái';

  override popularMangaSelector() {
    return '#slide-top > .item:contains(a)';
  }

  override genreListSelector() {
    return 'ul.genres-grid li a';
  }

  override genreOption(element: HtmlElement): SelectOption {
    return {
      name: element.selectFirst('.genre-meta .name')?.text() ?? '',
      id: relativeUrl(element.absUrl('href') || element.attr('href') || '').slice(1),
    };
  }

  // The older chapters come from a second request.
  override async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const chapters = this.parseChapterList(document);
    const more = document.selectFirst('.c-chapter-readmore')?.absUrl('data-ajax-url');
    if (more) chapters.push(...this.parseChapterList(await this.fetchDocument(more)));
    return chapters;
  }
}

export default defineExtension({
  createSource: () => new SayHentai().toSource(),
});
