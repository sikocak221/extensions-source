import { type Chapter, type MangaDetails, type MangaSummary, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';

// Two entries over the same archive: one page per chapter, or twenty. Manga urls are "/archive/#<pages>",
// chapter urls "/comic/<first page>/#<pages>".
const entry = (pages: number): MangaDetails => {
  const title = `TwoKinds (${pages === 1 ? '1 page' : `${pages} pages`} per chapter)`;
  return {
    url: `/archive/#${pages}`,
    title,
    thumbnailUrl: `https://dummyimage.com/768x994/000/ffffff.jpg&text=${encodeURIComponent(title)}`,
    author: 'Tom Fischbach',
    artist: 'Tom Fischbach',
    status: 'unknown',
  };
};

class TwoKinds extends SingleSeries {
  readonly name = 'Keenspot TwoKinds';
  readonly baseUrl = 'https://twokinds.keenspot.com';
  readonly series = entry(1);

  override get catalogue(): MangaDetails[] {
    return [entry(1), entry(20)];
  }

  async archive(): Promise<{ id: string; name: string }[]> {
    const document = await this.fetchDocument('/archive/');
    return document
      .select('.chapter-links > a')
      .map((a) => ({ id: (a.attr('href') ?? '').split('/')[2] ?? '', name: a.selectFirst('span')?.text() ?? '' }));
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const size = Number(manga.url.split('#')[1]) || 1;
    const pages = await this.archive();
    const chapters: Chapter[] = [];
    for (let i = 0; i < pages.length; i += size) {
      const last = pages[Math.min(pages.length, i + size) - 1]!;
      chapters.push({
        url: `/comic/${pages[i]!.id}/#${size}`,
        name: size === 1 ? `Page ${pages[i]!.name}` : `Pages ${pages[i]!.name}-${last.name}`,
        number: i / size + 1,
      });
    }
    return chapters.reverse();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const [path = '', size = '1'] = chapter.url.split('#');
    const first = path.split('/')[2] ?? '';
    if (size === '1') return [{ index: 0, url: `${this.baseUrl}${path}` }];
    const pages = await this.archive();
    const start = pages.findIndex((p) => p.id === first);
    return pages
      .slice(start, start + Number(size))
      .map((p, index) => ({ index, url: `${this.baseUrl}/comic/${p.id}/` }));
  }

  override async getImageUrl(page: Page): Promise<string> {
    return (await this.fetchDocument(page.url ?? '')).selectFirst('#content article img')?.attr('src') ?? '';
  }

  override getWebUrl(item: { url: string }): string {
    return `${this.baseUrl}${item.url.split('#')[0]}`;
  }

  override resolveUrl(url: string): MangaSummary | null {
    return /^https?:\/\/twokinds\.keenspot\.com(\/|$)/i.test(url.trim()) ? this.summary() : null;
  }
}

export default defineExtension({
  createSource: () => new TwoKinds().toSource(),
});
