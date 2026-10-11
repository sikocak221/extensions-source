import {
  type FilterOption,
  type FilterState,
  type HtmlElement,
  type MangaPage,
  defineExtension,
} from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

const PAGE_SIZE = 20;

class HanmokkuScan extends ZeistManga {
  readonly name = 'Hanmokku Scan';
  readonly baseUrl = 'https://hanmokkuscan.blogspot.com';

  override mangaCategory = 'Todos os Projetos';
  override chapterCategory = 'Capítulo';
  override hasFilters = true;
  override hasStatusFilter = false;
  override hasTypeFilter = false;
  override hasLanguageFilter = false;
  override hasGenreFilter = true;

  // Text search answers an html page (the feed ignores most queries).
  override async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    if (!query.trim()) return super.search(query, page, filters);
    const url =
      `${this.baseUrl}/search?q=${encodeURIComponent(query.trim())}` +
      `&max-results=${PAGE_SIZE + 1}&start-index=${PAGE_SIZE * (page - 1) + 1}`;
    const document: HtmlElement = await this.fetchDocument(url);
    const items = document.select('div.grid.gtc-f141a > div').flatMap((element) => {
      const link = element.selectFirst('a');
      const title = element.selectFirst('a.ck')?.text();
      if (!link || !title) return [];
      return [
        {
          url: (link.attr('href') ?? '').replace(/^https?:\/\/[^/]+/, ''),
          title,
          thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
        },
      ];
    });
    return { items, hasNextPage: false };
  }

  override getGenreList(): FilterOption[] {
    return [
      'Ação', 'Adulto', 'Aventura', 'Comédia', 'Drama', 'Ecchi', 'Esporte', 'Fantasia', 'Harém', 'Horror', 'Isekai',
      'Mistério', 'Musical', 'Psicológico', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sobrenatural',
    ].map((genre) => ({ label: genre, value: genre })); // prettier-ignore
  }
}

export default defineExtension({
  createSource: () => new HanmokkuScan().toSource(),
});
