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

class Love4u extends FMReader {
  readonly name = 'Love4u';
  readonly baseUrl = 'https://love4u.net';

  override latestUpdatesUrl(page: number) {
    return `${this.baseUrl}/manga-list.html?page=${page}&sort=last_update`;
  }

  override async fetchChapterList(manga: MangaSummary): Promise<Chapter[]> {
    const mangaId = /(\d+)\//.exec(manga.url)?.[1];
    if (!mangaId) throw new Error('Could not find manga id');
    const document = await this.fetchDocument(
      `${this.baseUrl}/app/manga/controllers/cont.Listchapter.php?mid=${mangaId}`,
    );
    return this.chapterListParse(document);
  }

  override chapterFromElement(element: HtmlElement): Chapter {
    const time = element.selectFirst(this.chapterTimeSelector)?.text();
    return {
      url: relativeUrl(element.absUrl('href') ?? ''),
      name: (element.attr('title') ?? '').trim(),
      uploadedAt: time ? this.parseChapterDate(time) || undefined : undefined,
    };
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

  override async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(`${this.baseUrl}${chapter.url}`);
    const chapterId = document.selectFirst('#chapter')?.attr('value');
    if (!chapterId) throw new Error('Could not find chapter id');
    const images = await this.fetchDocument(`${this.baseUrl}/app/manga/controllers/cont.listImg.php?cid=${chapterId}`);
    return this.pageListParse(images, chapter);
  }
}

export default defineExtension({
  createSource: () => new Love4u().toSource(),
});
