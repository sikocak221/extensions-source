import { defineExtension } from '@matane/extension-sdk';
import type { Chapter, Page } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

const PROTECTED_PAYLOAD_REGEX =
  /const\s+[^;]+?=atob\('([^']+)'\),[^;]+?=atob\('([^']+)'\),[^;]+?=atob\('([^']+)'\),[^;]+?=atob\('([^']+)'\),[^;]+?='([^']+)'/s;

function decodeProtectedPayload(script: string): string {
  if (!script.includes("split('').reverse().join('')") || !script.includes("JSON[atob('cGFyc2U=')]"))
    throw new Error('Not a protected payload script');
  const match = PROTECTED_PAYLOAD_REGEX.exec(script);
  if (!match) throw new Error('Protected payload not found');
  const key = [1, 2, 3, 4].map((i) => base64.decode(match[i]!)).join('');
  if (!key) throw new Error('Protected payload key is empty');
  const encrypted = base64.decode([...match[5]!].reverse().join(''));
  return Array.from(encrypted, (ch, index) =>
    String.fromCharCode(ch.charCodeAt(0) ^ key.charCodeAt(index % key.length)),
  ).join('');
}

class TruyenTuoiTho extends Madara {
  readonly name = 'TruyenTuoiTho';
  readonly baseUrl = 'https://truyentuoitho.com';

  override chapterDatePattern = 'dd/MM/yyyy';
  override filterNonMangaItems = false;
  override chapterMode = 'MangaAjaxPaginated' as const;

  override async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(this.absolute(chapter.url));
    const defaultPages = this.parsePages(document);
    if (defaultPages.length > 0) return defaultPages;
    // Some chapters hide the image list in an obfuscated script.
    let payload: string | undefined;
    for (const script of document.select('div.reading-content script')) {
      try {
        payload = decodeProtectedPayload(script.html());
        break;
      } catch {
        // Not a protected payload script.
      }
    }
    if (!payload) return [];
    try {
      const images = (JSON.parse(payload) as { images?: string[] }).images ?? [];
      return images.map((imageUrl, index) => ({ index, imageUrl }));
    } catch {
      return [];
    }
  }
}

export default defineExtension({
  createSource: () => new TruyenTuoiTho().toSource(),
});
