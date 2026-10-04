import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

/**
 * The chapter pages hand out image urls (admin-ajax load_img_data tokens) that only work with the PHP session the
 * page was loaded with. The site accepts a session id picked by the client, so one is made up per chapter.
 */
let session = '';

class MangaHubfr extends Madara {
  readonly name = 'MangaHub.fr';
  readonly baseUrl = 'https://mangahub.fr';

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'd MMMM yyyy';

  override chapterListSelector(): string {
    return 'li.wp-manga-chapter:not(.vip-permission)';
  }

  override async getPages(chapter: Chapter): Promise<Page[]> {
    session = `PHPSESSID=${Array.from({ length: 26 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')}`;
    const response = await http.get(this.absolute(chapter.url), { headers: { ...this.headers(), Cookie: session } });
    return this.parsePages(html.load(response.body, { baseUrl: response.url }));
  }

  override imageHeaders(): Record<string, string> {
    return session ? { ...super.imageHeaders(), Cookie: session } : super.imageHeaders();
  }
}

export default defineExtension({
  createSource: () => new MangaHubfr().toSource(),
});
