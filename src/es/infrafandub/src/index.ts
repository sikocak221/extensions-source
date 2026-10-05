import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';
import { decodeEntities, pathOf } from './madara/MadaraBase';

/**
 * The chapter list is read as text: parsing the whole (hundreds of chapters) list with the HTML module takes more
 * than the 2 s a call may run without yielding.
 */
function chapterRows(source: Madara, body: string): Chapter[] {
  const chapters: Chapter[] = [];
  for (const row of body.split(/<li\b[^>]*class="[^"]*wp-manga-chapter[^"]*"[^>]*>/).slice(1)) {
    const link = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/.exec(row);
    const href = link?.[1]?.trim();
    // Locked (premium) chapters link to "#".
    if (!link || !href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    const strip = (text: string) =>
      decodeEntities(text.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
    const date = /<span[^>]*chapter-release-date[^>]*>([\s\S]*?)<\/span>\s*(?:<\/span>)?/.exec(row)?.[1];
    chapters.push({
      url: pathOf(href),
      name: strip(link[2]!),
      uploadedAt: source.parseChapterDate(date ? strip(date) : undefined),
    });
  }
  return chapters;
}

class InfraFandub extends Madara {
  readonly name = 'InfraFandub';
  readonly baseUrl = 'https://infrafandub.com';

  override supportsLatest = false;
  override chapterDatePattern = 'dd/MM/yyyy';
  override chapterMode = 'MangaAjax' as const;
  override archiveSelector(): string {
    return 'div.manga-item';
  }
  override archiveUrlSelector = 'div.title a';
  override mangaDetailsSelectorTitle = 'h1.series-title';
  override mangaDetailsSelectorAuthor = 'div.series-details div.detail-item:contains(Autor) span.detail-value';
  override mangaDetailsSelectorArtist = 'div.series-details div.detail-item:contains(Artista) span.detail-value';
  override mangaDetailsSelectorGenre = 'div.genres a.genre-tag';
  override mangaDetailsSelectorDescription = 'div.summary-text';
  override mangaDetailsSelectorThumbnail = 'aside.sidebar img.series-cover';
  override mangaDetailsSelectorStatus = 'div.series-details div.detail-item:contains(Estado) span.detail-value';
  override async fetchChapters(mangaPath: string, _mangaPage: HtmlElement | null): Promise<Chapter[]> {
    const response = await http.post(this.chapterAjaxUrl(mangaPath), { form: {} }, { headers: this.xhrHeaders() });
    return chapterRows(this, response.body);
  }
}

export default defineExtension({
  createSource: () => new InfraFandub().toSource(),
});
