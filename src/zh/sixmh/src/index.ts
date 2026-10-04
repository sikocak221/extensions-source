import type { HtmlElement, MangaDetails, MangaSummary, Page } from '@matane/extension-sdk';
import { defineExtension } from '@matane/extension-sdk';
import { MCCMSWeb, removePathPrefix } from './mccms/MCCMSWeb';

// Key derived from https://www.liumanhua.com/template/pc/liumanhua/js/index-v2.js (CryptoJS AES-CBC).
const AES_KEY = '9S8$vJnU2ANeSRoF';

function decodeData(encoded: string): string {
  const bytes = base64.decodeBytes(encoded);
  const plain = crypto.aesDecrypt(bytes.subarray(16), utf8.encode(AES_KEY), { mode: 'cbc', iv: bytes.subarray(0, 16) });
  return utf8.decode([...plain]);
}

class SixMH extends MCCMSWeb {
  readonly name = '6Manhua';
  readonly baseUrl = 'https://www.liumanhua.com';

  override simpleMangaSelector(): string {
    return 'div.cy_list_mh ul';
  }

  override simpleMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('li.title > a');
    return {
      url: removePathPrefix((link?.absUrl('href') ?? '').replace(/^https?:\/\/[^/]+/, '')),
      title: link?.text() ?? '',
      thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
    };
  }

  // Use the mobile user agent.
  override searchHeaders(): Record<string, string> {
    return this.mobileHeaders();
  }

  override mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const element = document.selectFirst('div.cy_info');
    const info = element?.select('div.cy_xinxi') ?? [];
    const status = info[0]?.selectFirst('span:nth-child(2)')?.text() ?? '';
    return {
      url: manga.url,
      title: element?.selectFirst('div.cy_title')?.text() || manga.title,
      thumbnailUrl: element?.selectFirst('div.cy_info_cover > a > img.pic')?.absUrl('src') || manga.thumbnailUrl,
      description: element?.selectFirst('div.cy_desc #comic-description')?.text() || undefined,
      author: info[0]?.selectFirst('span:first-child > a')?.text() || undefined,
      status: status.includes('连载') ? 'ongoing' : status.includes('完结') ? 'completed' : 'unknown',
      genres: info[1]?.select('span:first-child > a').map((a) => a.text()),
    };
  }

  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/(?:www\.|m\.)?liumanhua\.com(\/\d+)/i.exec(url.trim());
    return match ? { url: match[1]!, title: '' } : null;
  }

  override chapterListSelector(): string {
    return 'ul#mh-chapter-list-ol-0 li.chapter__item';
  }

  override getDescendingChapters<T>(chapters: T[]): T[] {
    return chapters;
  }

  override pageListParse(body: string): Page[] {
    const encoded = /params = '([A-Za-z0-9+/=]+)'/.exec(body)?.[1] ?? '';
    const images = (JSON.parse(decodeData(encoded)) as { images: string[] }).images;
    return images.map((imageUrl, index) => ({ index, imageUrl }));
  }
}

export default defineExtension({
  createSource: () => new SixMH().toSource(),
});
