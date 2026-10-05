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

class HadesnoFansub extends Madara {
  readonly name = 'Hades no Fansub';
  readonly baseUrl = 'https://lectorhades.latamtoon.com';

  override chapterDatePattern = 'MM/dd/yyyy';
  override chapterMode = 'MangaAjax' as const;
  override mangaSubString = 'tmo';
  override mangaDetailsSelectorStatus =
    'div.summary_content > div.post-content div.post-content_item:has(div.summary-heading:contains(Status)) div.summary-content';
  override async fetchChapters(mangaPath: string, _mangaPage: HtmlElement | null): Promise<Chapter[]> {
    const response = await http.post(this.chapterAjaxUrl(mangaPath), { form: {} }, { headers: this.xhrHeaders() });
    return chapterRows(this, response.body);
  }
}

export default defineExtension({
  createSource: () => new HadesnoFansub().toSource(),
});
