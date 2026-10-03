import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { HIDE_LOCKED_PREFERENCE, InitManga } from './initmanga/InitManga';
import { htmlToText, parseDate, relativeUrl } from './initmanga/utils';

class MangaDrama extends InitManga {
  readonly name = 'MangaDrama';
  readonly baseUrl = 'https://mangadrama.com';

  override mangaUrlDirectory = 'manga';
  override popularUrlSlug = 'manga-ranking';
  override latestUrlSlug = 'recently-updated';
  override chapterPagePathSegment = 'chapter';
  override datePattern = 'MMMM d, yyyy h:mm a';

  override parseMangaDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details = super.parseMangaDetails(document, manga);
    // "Author: <a>Name</a>" — the value is the element after the label's text node.
    const info = document.selectFirst('div.manga-info-details')?.html() ?? '';
    const value = (label: string) => {
      const match = new RegExp(`(?:^|>)\\s*${label}:\\s*<(\\w+)[^>]*>([\\s\\S]*?)</\\1>`).exec(info);
      return match ? htmlToText(match[2]!).trim() || undefined : undefined;
    };
    return {
      ...details,
      author: value('Author'),
      artist: value('Illustrator'),
      genres: document.select('div#genre-tags a:not(.uk-disabled)').map((a) => a.text()),
    };
  }

  override chapterListSelector(): string {
    return 'div.chapter-list > div';
  }

  override chapterFromElement(element: HtmlElement): Chapter | null {
    const link = element.selectFirst('a');
    if (!link) return null;
    const tooltip = link.selectFirst('[uk-tooltip]')?.attr('uk-tooltip') ?? '';
    const date = (tooltip.split('title:')[1] ?? '').split(';')[0]!.trim();
    return {
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      name: link.selectFirst('.uk-flex-none')?.text() || link.text(),
      uploadedAt: parseDate(date, this.datePattern),
    };
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE],
  createSource: () => new MangaDrama().toSource(),
});
