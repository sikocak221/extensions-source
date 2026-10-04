import { type Chapter, type MangaSummary, type Page, defineExtension } from '@matane/extension-sdk';
import { GoDa } from './goda/GoDa';

const API = 'https://api-get-v3.mgsearcher.com';

const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const CUSTOM = '_-9876543210abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PREFIX = 'J7r';
const MARKER1 = 'kD';
const MARKER2 = 'W4s';
const SUFFIX = 'nQ';
const GROUP = 7;

/**
 * The /api/v2/chapter/getinfo endpoint returns the image list as an obfuscated string. This reverses the
 * site's client-side decoder (assets/runtime/chapter-decoder.js) into the original JSON array of images.
 *
 * Pipeline: strip "J7r" prefix / "nQ" suffix -> split into 3 parts around the "kD" and "W4s" markers ->
 * reorder to part3+part1+part2 -> reverse every 2nd 7-char block -> map the custom alphabet back to standard
 * base64url -> base64 decode -> UTF-8 JSON.
 */
function decodeChapterImages(input: string): string {
  const fail = () => new Error('未知的章节数据格式');
  if (!input.startsWith(PREFIX) || !input.endsWith(SUFFIX)) throw fail();
  const body = input.slice(PREFIX.length, input.length - SUFFIX.length);
  const payloadLen = body.length - MARKER1.length - MARKER2.length;
  if (payloadLen <= 0) throw fail();
  const aLen = Math.floor(payloadLen / 3);
  const bLen = Math.floor((payloadLen - aLen) / 2);
  const cLen = payloadLen - aLen - bLen;
  const part1 = body.slice(0, bLen);
  const marker1 = body.slice(bLen, bLen + MARKER1.length);
  const part2 = body.slice(bLen + MARKER1.length, bLen + MARKER1.length + cLen);
  const marker2 = body.slice(bLen + MARKER1.length + cLen, bLen + MARKER1.length + cLen + MARKER2.length);
  const part3 = body.slice(bLen + MARKER1.length + cLen + MARKER2.length);
  if (marker1 !== MARKER1 || marker2 !== MARKER2 || part3.length !== aLen) throw fail();

  const reordered = part3 + part1 + part2;
  let unzigzag = '';
  for (let i = 0, block = 0; i < reordered.length; i += GROUP, block++) {
    const chunk = reordered.slice(i, i + GROUP);
    unzigzag += block % 2 === 1 ? [...chunk].reverse().join('') : chunk;
  }
  let standard = '';
  for (const ch of unzigzag) {
    const index = CUSTOM.indexOf(ch);
    if (index < 0) throw new Error('无效的章节数据字符');
    standard += STD[index];
  }
  const base64Text = standard.replace(/-/g, '+').replace(/_/g, '/');
  return utf8.decode([
    ...base64.decodeBytes(base64Text.padEnd(base64Text.length + ((4 - (base64Text.length % 4)) % 4), '=')),
  ]);
}

interface ChapterListDto {
  data: {
    id: number | string;
    slug: string;
    chapters: { id: number | string; attributes: { title: string; slug: string; updatedAt: string } }[];
  };
}

class GoDaSource extends GoDa {
  readonly name = 'GoDa漫画';
  readonly baseUrl = 'https://baozimh.org';
  readonly lang = 'zh';

  override async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const page = await this.fetchDocument(`${this.baseUrl}${manga.url}`);
    const mangaId = page.selectFirst('#mangachapters')?.attr('data-mid');
    if (!mangaId) throw new Error('該漫畫章節已下架，建议前往源站或官网訪問');
    const response = await http.get<ChapterListDto>(`${API}/api/manga/get?mid=${mangaId}&mode=all`, {
      headers: this.headers(),
      responseType: 'json',
    });
    const { slug, chapters } = response.body.data;
    return [...chapters].reverse().map((chapter) => {
      const date = Date.parse(chapter.attributes.updatedAt);
      return {
        url: `/manga/${slug}/${chapter.attributes.slug}#${mangaId}/${chapter.id}`,
        name: chapter.attributes.title,
        uploadedAt: Number.isNaN(date) ? undefined : date,
      };
    });
  }

  override pageListUrl(mangaId: string, chapterId: string): string {
    return `${API}/api/v2/chapter/getinfo?m=${mangaId}&c=${chapterId}`;
  }

  override async getPages(chapter: Chapter): Promise<Page[]> {
    const [mangaId = '', chapterId = ''] = (chapter.url.split('#')[1] ?? '').split('/');
    if (!mangaId || !chapterId) throw new Error('请刷新漫画');
    const response = await http.get<{ data: { info: { images: { images: string } } } }>(
      this.pageListUrl(mangaId, chapterId),
      { headers: this.headers(), responseType: 'json' },
    );
    const images = JSON.parse(decodeChapterImages(response.body.data.info.images.images)) as {
      url: string;
      order: number;
    }[];
    return [...images]
      .sort((a, b) => a.order - b.order)
      .map((image, index) => ({ index, imageUrl: `https://c-nd2-1.6wm.top${image.url}` }));
  }
}

export default defineExtension({
  createSource: () => new GoDaSource().toSource(),
});
