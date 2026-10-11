import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  type Source,
  defineExtension,
} from '@matane/extension-sdk';
import { ClipStudioReader } from './clipstudioreader/ClipStudioReader';
import { absoluteUrl, findRscObject, hostOf } from './clipstudioreader/utils';

const HIDE_LOCKED: Preference = { type: 'switch', key: 'hide_locked', label: 'Hide Locked Chapters', default: false };

interface RankingTitle {
  id: number;
  name: string;
  thumbnailPath?: string | null;
}
interface ChapterPackage {
  id: number;
  number: number;
  name?: string | null;
  point?: number | null;
  fairInfo?: { free?: { endAt?: string | null } | null; trial?: { endAt?: string | null } | null } | null;
}
interface ChapterList {
  packages: ChapterPackage[];
  userPackages?: { id: number }[] | null;
  userStatus?: string | null;
}

class ComicFesta extends ClipStudioReader {
  readonly name = 'Comic Festa';
  readonly baseUrl = 'https://comic.iowl.jp';

  override headers(): Record<string, string> {
    return {
      ...super.headers(),
      Cookie: 'checked_age=1; sp_display=1; cf_checked_age_guest=1; cf_checked_age=1',
    };
  }

  async fetchDocument(url: string) {
    const response = await http.get(url, { headers: this.headers() });
    return { document: html.load(response.body, { baseUrl: response.url }), body: response.body };
  }

  async getPopular(page: number): Promise<MangaPage> {
    const response = await http.get(`${this.baseUrl}/sales_rankings/monthly_general?page=${page}`, {
      headers: { ...this.headers(), rsc: '1' },
    });
    const result = findRscObject<{ titles: RankingTitle[] }>(response.body, (v) => Array.isArray(v.titles));
    const items = (result?.titles ?? []).map((t): MangaSummary => ({
      url: `/titles/${t.id}`,
      title: t.name,
      thumbnailUrl: t.thumbnailPath ?? undefined,
    }));
    return { items, hasNextPage: page !== 2 };
  }

  async titleList(url: string): Promise<MangaPage> {
    const { document } = await this.fetchDocument(url);
    const items = document.select('div.list-detail-box').flatMap((element): MangaSummary[] => {
      const href = element.selectFirst('.list-left-box a')?.absUrl('href');
      const id = href?.split(/[?#]/)[0]!.replace(/\/+$/, '').split('/').pop();
      if (!id) return [];
      return [
        {
          url: `/titles/${id}`,
          title: element.selectFirst('div.title-box')?.text().trim() ?? '',
          thumbnailUrl: element.selectFirst('img')?.absUrl('src'),
        },
      ];
    });
    return { items, hasNextPage: document.selectFirst('a[rel=next]') != null };
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.titleList(`${this.baseUrl}/titles?page=${page}&sort=release&search_form%5Bother_item%5D%5B%5D=new`);
  }

  async search(query: string, page: number): Promise<MangaPage> {
    const q = encodeURIComponent(query);
    return this.titleList(
      `${this.baseUrl}/titles?page=${page}&search_form%5Bkeyword%5D=${q}&search=${q}&commit=search`,
    );
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const { document } = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return this.parseDetails(document, manga);
  }

  parseDetails(document: ReturnType<typeof html.load>, manga: MangaSummary): MangaDetails {
    const status = document
      .select('[class*="latest-package-num-display"]')
      .map((e) => e.text())
      .join(' ');
    return {
      url: manga.url,
      title: document.selectFirst("h1[class*='titleName']")?.text().trim() || manga.title,
      author:
        document
          .select("a[href*='/authors/']")
          .map((e) => e.text())
          .join(', ') || undefined,
      description: document.selectFirst("div[class*='description']")?.text().trim() || undefined,
      genres: document.select("[class*='outlineTag'] a").map((e) => e.text()),
      thumbnailUrl: document.selectFirst("img[class*='thumbnail']")?.absUrl('src') ?? manga.thumbnailUrl,
      status: status.includes('完結') ? 'completed' : 'ongoing',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const { body } = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const list = findRscObject<ChapterList>(body, (v) => Array.isArray(v.packages));
    if (!list) return [];
    const hideLocked = prefs.get<boolean>(HIDE_LOCKED.key) ?? false;
    const loggedIn = list.userStatus != null && list.userStatus !== 'guest';
    const owned = new Set((list.userPackages ?? []).map((p) => p.id));
    const chapters: Chapter[] = [];
    for (const p of list.packages) {
      const isOwned = owned.has(p.id);
      let path = 'download';
      if (isOwned) path = 'download';
      else if (p.fairInfo?.free?.endAt != null) path = 'free_download';
      else if (p.fairInfo?.trial?.endAt != null) path = 'trial_download';
      else if (p.point === 0 && !loggedIn) path = 'free_download';
      const locked = path === 'download' && !isOwned;
      if (hideLocked && locked) continue;
      const number = String(p.number).replace(/\.0$/, '');
      chapters.push({
        url: `/volumes/${p.id}/${path}`,
        name: `${locked ? '🔒 ' : ''}${p.name?.trim() ? p.name : `${number}巻`}`,
        number: p.number,
      });
    }
    return chapters.reverse();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.request<string>({
      url: absoluteUrl(this.baseUrl, chapter.url),
      headers: this.headers(),
    });
    const landing = response.url.replace(/^https?:\/\/[^/]+\//, '').split(/[/?#]/)[0];
    if (hostOf(response.url) === hostOf(this.baseUrl) && (landing === 'entry' || landing === 'error'))
      throw new Error('Log in via WebView and purchase this product to read.');
    if (response.status >= 400) throw new Error(`HTTP ${response.status} for ${response.url}`);
    return this.fetchPages(response.url, response.body);
  }

  resolveUrl(url: string): MangaSummary | null {
    if (hostOf(url) !== hostOf(this.baseUrl)) return null;
    const id = /\/titles\/(\d+)/.exec(url)?.[1];
    return id ? { url: `/titles/${id}`, title: '' } : null;
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      getLatest: (page) => this.getLatest(page),
      search: (query, page) => this.search(query, page),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      transformImage: (page, bytes) => this.transformImage(page, bytes),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => absoluteUrl(this.baseUrl, item.url),
    };
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED],
  createSource: () => new ComicFesta().toSource(),
});
