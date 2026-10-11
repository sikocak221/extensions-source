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

class RawINU extends FMReader {
  readonly name = 'RawINU';
  readonly baseUrl = 'https://rawinu.com';

  override infoElementSelector = 'div.card-body div.row';

  override extraHeaders() {
    return { Cookie: 'smartlink_shown=1' };
  }

  override popularMangaFromElement(element: HtmlElement): MangaSummary {
    const manga = super.popularMangaFromElement(element);
    return { ...manga, thumbnailUrl: manga.thumbnailUrl?.replace(/^'|'$/g, '') };
  }

  // The listing is behind an anti-DDoS page that asks for a cookie key.
  override async fetchDocument(url: string, headers: Record<string, string> = {}): Promise<HtmlElement> {
    let response = await http.get(url, { headers: { ...this.headers(), ...headers } });
    if (response.body.includes('DDoS protection is activated for your IP')) {
      const key = /'([a-f0-9]{32})'/.exec(response.body)?.[1];
      if (key)
        response = await http.get(url, {
          headers: { ...this.headers(), ...headers, Cookie: `smartlink_shown=1; ct_anti_ddos_key=${key}` },
        });
    }
    return html.load(response.body, { baseUrl: response.url });
  }

  override async fetchChapterList(manga: MangaSummary): Promise<Chapter[]> {
    const slug = manga.url.split('/manga-').pop()!.split('.html')[0];
    const response = await http.get(`${this.baseUrl}/app/manga/controllers/cont.Listchapter.php?slug=${slug}`, {
      headers: this.headers(),
    });
    // The chapter urls are relative to the site, not to the controller.
    const document = html.load(response.body, { baseUrl: this.baseUrl });
    return document.select(this.chapterListSelector()).map((element): Chapter => ({
      url: relativeUrl(element.absUrl('href') ?? ''),
      name: (element.attr(this.chapterNameAttrSelector) ?? '').trim(),
      uploadedAt: this.relativeChapterDate(element),
    }));
  }

  relativeChapterDate(element: HtmlElement): number | undefined {
    const text = element.selectFirst(this.chapterTimeSelector)?.text();
    return text ? this.parseRelativeDate(text) || undefined : undefined;
  }

  override async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(`${this.baseUrl}${chapter.url}`);
    const id = document.selectFirst('input[name=chapter]#chapter')?.attr('value');
    if (!id) throw new Error('Chapter id not found');
    const images = await this.fetchDocument(`${this.baseUrl}/app/manga/controllers/cont.imagesChap.php?cid=${id}`);
    return images
      .select(this.pageListImageSelector)
      .map((img, index): Page => ({ index, imageUrl: this.imgAttr(img) }));
  }
}

export default defineExtension({
  createSource: () => new RawINU().toSource(),
});
