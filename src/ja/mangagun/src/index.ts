import {
  type Chapter,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { FMReader } from './fmreader/FMReader';
import { relativeUrl } from './fmreader/utils';

class MangaGun extends FMReader {
  readonly name = 'MangaGun';
  readonly baseUrl = 'https://nihonkuni.com';

  override infoElementSelector = 'div.manga-detail-container';
  override mangaDetailsSelectorDescription =
    '.description-text-content, .manga-info-list > li:nth-child(1) .info-field-value';
  override pageListImageSelector = 'img[id^=page]';

  override extraHeaders() {
    return { Cookie: 'smartlink_shown=1' };
  }

  // The title is base64 encoded and filled in by JS.
  override parseMangaTitle(document: HtmlElement): string {
    const encoded = document.selectFirst('h1.manga-main-title')?.attr('data-enc');
    return encoded ? base64.decode(encoded) : '';
  }

  // The source is picky about the url format.
  mangaUrl(sortBy: string, page: number) {
    return `${this.baseUrl}/manga-list.html?listType=pagination&page=${page}&artist=&author=&group=&m_status=&name=&genre=&ungenre=&magazine=&sort=${sortBy}&sort_type=DESC`;
  }

  override popularMangaUrl(page: number) {
    return this.mangaUrl('views', page);
  }

  override latestUpdatesUrl(page: number) {
    return this.mangaUrl('last_update', page);
  }

  override popularMangaSelector() {
    return 'div.manga-grid div.manga-card';
  }

  override popularMangaNextPageSelector() {
    return '.page-link.next';
  }

  override hasNextPage(document: HtmlElement) {
    return document.selectFirst(this.popularMangaNextPageSelector())?.attr('href') != null;
  }

  override imgAttr(element: HtmlElement | null | undefined) {
    if (!element) return undefined;
    for (const name of ['data-original', 'data-src', 'data-bg', 'data-srcset']) {
      if (element.attr(name) != null) return element.absUrl(name);
    }
    const style = element.attr('style');
    if (style != null)
      return style
        .split('url(')
        .slice(1)
        .join('url(')
        .split(')')[0]!
        .trim()
        .replace(/^['"]|['"]$/g, '');
    return element.absUrl('src');
  }

  override popularMangaFromElement(element: HtmlElement): MangaSummary {
    const title = element.selectFirst('.manga-title');
    return {
      url: relativeUrl(title?.absUrl('href') ?? ''),
      title: title?.text().trim() ?? '',
      thumbnailUrl: this.imgAttr(element.selectFirst('.manga-cover')),
    };
  }

  override async fetchChapterList(manga: MangaSummary): Promise<Chapter[]> {
    const index = manga.url.indexOf('manga-');
    // Handling version compatibility, previous version used the 'raw-' prefix.
    const slug = (index >= 0 ? manga.url.slice(index + 6) : manga.url.split('raw-').pop()!).split('.html')[0];
    const document = await this.fetchDocument(
      `${this.baseUrl}/app/manga/controllers/cont.Listchapter.php?slug=${slug}`,
    );
    return document.select('.at-series a').map((a): Chapter => ({
      name: a.selectFirst('.chapter-name')?.text().trim() ?? '',
      url: (a.absUrl('href') ?? '').split('controllers').slice(1).join('controllers'),
      uploadedAt: this.parseChapterDate(a.selectFirst('.chapter-time')?.text() ?? '') || undefined,
    }));
  }

  parseChapterDate(date: string): number {
    const parts = date.trim().split(' ');
    const value = Number.parseInt(parts[this.dateValueIndex] ?? '', 10);
    if (Number.isNaN(value)) return 0;
    const d = new Date();
    d.setSeconds(0, 0);
    switch (parts[this.dateWordIndex]) {
      case 'mins':
      case 'minutes':
        d.setMinutes(d.getMinutes() - value);
        break;
      case 'hours':
        d.setHours(d.getHours() - value);
        break;
      case 'days':
        d.setDate(d.getDate() - value);
        break;
      case 'weeks':
        d.setDate(d.getDate() - value * 7);
        break;
      case 'months':
        d.setMonth(d.getMonth() - value);
        break;
      case 'years':
        d.setFullYear(d.getFullYear() - value);
        break;
      default:
        return 0;
    }
    return d.getTime();
  }

  override pageListParse(document: HtmlElement, _chapter: Chapter): Page[] {
    return document
      .select(this.pageListImageSelector)
      .map((img, index): Page => ({ index, imageUrl: img.absUrl('src') }));
  }
}

export default defineExtension({
  createSource: () => new MangaGun().toSource(),
});
