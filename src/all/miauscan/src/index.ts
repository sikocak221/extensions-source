import {
  type Chapter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

const PORTUGUESE_GENRE_ID = '307';
const PORTUGUESE_SUFFIX = /^\(\s*Portugu[êe]s\s*\)\s*/i;

class MiauScan extends MangaThemesia {
  readonly name = 'Miau Scan';
  readonly baseUrl = 'https://leemiau.com';

  constructor(readonly lang: string) {
    super();
  }

  override datePattern = 'dd/MM/yyyy';
  override seriesGenreSelector = '.mgen a:not(:contains(Português))';
  override seriesStatusSelector = '.lm4-poster-status';
  override seriesThumbnailSelector = 'img.lm4-poster-image';
  override seriesDescriptionSelector = '.lm4-summary-full';

  override searchMangaUrl(page: number, query: string, filters: FilterState): string {
    const url = super.searchMangaUrl(page, query, filters);
    return this.lang === 'pt' ? `${url}&genre%5B%5D=${PORTUGUESE_GENRE_ID}` : url;
  }

  override searchMangaFromElement(element: HtmlElement): MangaSummary {
    const manga = super.searchMangaFromElement(element);
    return { ...manga, title: manga.title.replace(PORTUGUESE_SUFFIX, '') };
  }

  override mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details = super.mangaDetailsParse(document, manga);
    details.title = details.title.replace(PORTUGUESE_SUFFIX, '');
    if (!details.description?.trim()) {
      details.description = document.selectFirst('.lm4-summary-short')?.text() ?? '';
    }
    return details;
  }

  override chapterFromElement(element: HtmlElement): Chapter {
    const link = element.selectFirst('a');
    const title = element
      .select('.lm4-chapter-name')
      .map((e) => e.text())
      .join(' ')
      .trim();
    const subtitle = element
      .select('.lm4-chapter-subtitle')
      .map((e) => e.text())
      .join(' ')
      .trim();
    return {
      url: this.toRelative(link?.absUrl('href') || link?.attr('href') || ''),
      name: subtitle && subtitle !== title ? `${title} - ${subtitle}` : title,
      uploadedAt: this.parseChapterDate(element.selectFirst('.lm4-chapter-date')?.text()),
    };
  }

  override imgAttr(element: HtmlElement | null | undefined): string {
    if (!element) return '';
    for (const name of ['data-lm-orig-src', 'data-lazy-src', 'data-src', 'data-cfsrc', 'src']) {
      if (element.attr(name) != null) return element.absUrl(name) ?? '';
    }
    return '';
  }

  override parseGenres(document: HtmlElement) {
    return super.parseGenres(document).filter((genre) => genre.value !== PORTUGUESE_GENRE_ID);
  }
}

export default defineExtension({
  createSource: ({ key }) => new MiauScan(key).toSource(),
});
