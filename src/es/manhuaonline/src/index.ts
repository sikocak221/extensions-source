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

class SamuraiScan extends Madara {
  readonly name = 'SamuraiScan';
  readonly baseUrl = 'https://samurai.j5z.xyz';

  override chapterDatePattern = 'dd MMMM, yyyy';
  override chapterMode = 'MangaAjax' as const;
  override mangaSubString = 'leer';
  override genreDirectory = 'l-generos';
  override mangaDetailsSelectorDescription = 'div.summary__content';
  override async fetchChapters(mangaPath: string, _mangaPage: HtmlElement | null): Promise<Chapter[]> {
    const response = await http.post(this.chapterAjaxUrl(mangaPath), { form: {} }, { headers: this.xhrHeaders() });
    return chapterRows(this, response.body);
  }
}

export default defineExtension({
  createSource: () => new SamuraiScan().toSource(),
});
