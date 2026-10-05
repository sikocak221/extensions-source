import {
  type FilterState,
  type HtmlElement,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';
import { unpack } from './packer';

class MangaTV extends MangaThemesia {
  readonly name = 'Manga TV';
  readonly baseUrl = 'https://mangatv.net';

  override mangaUrlDirectory = '/lista';
  override datePattern = 'yyyy-MM-dd';
  override seriesDescriptionSelector = 'b:contains(Sinopsis) + span';
  override chapterListSelector(): string {
    return '#chapterlist ul.clstyle li:has(.dt a)';
  }

  // The series urls are "/manga/<id>/<slug>".
  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/(?:www\.)?mangatv\.net(\/manga\/[^/?#]+\/[^/?#]+)/i.exec(url);
    return match ? { url: match[1]!, title: '' } : null;
  }

  override searchMangaUrl(page: number, query: string, _filters: FilterState): string {
    return `${this.baseUrl}${this.mangaUrlDirectory}?s=${encodeURIComponent(query)}&page=${page}`;
  }

  // The images are in a packed script, Base64 encoded without the scheme.
  override pageListParse(document: HtmlElement, _body: string): Page[] {
    const packed = document
      .select('script')
      .map((s) => s.html())
      .find((text) => text.includes('eval'));
    if (!packed) throw new Error('Image list not found');
    const json = /["']?(?:images|imageUrls)["']?\s*[:=]\s*(\[.*?])/s.exec(unpack(packed))?.[1] ?? '';
    let images: string[] = [];
    try {
      images = JSON.parse(json.replace(/,\s+]/g, ']')) as string[];
    } catch {
      images = [];
    }
    return images.map((url, index) => ({ index, imageUrl: `https:${utf8.decode([...base64.decodeBytes(url)])}` }));
  }
}

export default defineExtension({
  createSource: () => new MangaTV().toSource(),
});
