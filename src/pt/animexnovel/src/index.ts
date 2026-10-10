import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://www.animexnovel.com';
const TYPES = ['Mangá', 'Manhwa', 'Manhua'];
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GROUPS = ['grp-alfabeto', 'grp-demografia', 'grp-classificacao', 'grp-categorias', 'grp-tags'];

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

function card(element: HtmlElement): MangaSummary {
  return {
    url: relativeUrl(element.selectFirst('a')?.absUrl('href') ?? element.absUrl('href') ?? ''),
    title: element.selectFirst('h2, h3, .search-content')?.text() ?? '',
    thumbnailUrl: element.selectFirst('img')?.absUrl('src'),
  };
}

/** The site returns one extra card per page: it is held back and shown on the last page. */
let lastManga: MangaSummary | undefined;

const clean = (text: string) => text.replace(new RegExp(`\\((${TYPES.join('|')})\\)`, 'gi'), '').trim();
const first = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''));
const joined = (value: unknown): string => (Array.isArray(value) ? value.join(', ') : String(value ?? ''));

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => doSearch('', page, {}),
    async getLatest(): Promise<MangaPage> {
      const doc = await load(BASE_URL);
      return {
        items: selectIgnoreCase(doc, 'div:contains(Últimos Mangás) + .axn-piz-container .axn-piz-card').map(card),
        hasNextPage: false,
      };
    },
    search: (query, page, filters) => doSearch(query, page, filters),
    async getFilters(): Promise<Filter[]> {
      const doc = await load(`${BASE_URL}/pesquisar`);
      const filters: Filter[] = [];
      for (const group of GROUPS) {
        const title = doc.selectFirst(`.filter-section-title:has(+ #${group})`)?.text();
        if (!title) continue;
        filters.push({
          type: 'group',
          id: group,
          label: title,
          filters: doc
            .select(`#${group} .axn-chip`)
            .map((chip): Filter => ({
              type: 'checkbox',
              id: `${group}.${chip.attr('data-value') ?? ''}`,
              label: chip.text(),
            })),
        });
      }
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const data = JSON.parse(decodeEntities(doc.selectFirst('#axn-data')?.html() ?? '{}')) as Record<string, any>;
      const status = (
        { ongoing: 'ongoing', completed: 'completed', published: 'completed' } as Record<string, MangaStatus>
      )[String(data.creativeWorkStatus ?? '').toLowerCase()];
      const alternate = clean(joined(data.alternateName));
      return {
        url: manga.url,
        title: clean(first(data.name)) || manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        description: `${data.description ?? ''}\n\nNomes Alternativos: ${alternate}`.trim(),
        genres: Array.isArray(data.genre) ? data.genre.map(String) : data.genre ? [String(data.genre)] : [],
        author: data.author?.name,
        artist: data.illustrator?.name,
        status: status ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      const category = doc.selectFirst('[data-categoria]')?.attr('data-categoria');
      if (!category) return [];
      const chapters: Chapter[] = [];
      for (let page = 1; ; page++) {
        const { body } = await http.get<{ title: string; id: number; link: string }[]>(
          `${BASE_URL}/wp-json/axn/v1/chapters/${category}?page=${page}`,
          { headers, responseType: 'json' },
        );
        if (!Array.isArray(body) || body.length === 0) break;
        for (const c of body) {
          const name = decodeEntities(c.title).split('–').slice(1).join('–').trim() || decodeEntities(c.title);
          if (/cap.tulo/i.test(name)) chapters.push({ url: relativeUrl(c.link), name });
        }
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(BASE_URL + chapter.url);
      const container = doc.selectFirst(
        '.spice-block-img-gallery, .wp-block-gallery, .spnc-entry-content, .leitor-cascata',
      );
      return (container?.select('img') ?? []).map((img, index) => ({ index, imageUrl: img.absUrl('src') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url).endsWith('animexnovel.com') && path.split('/').filter(Boolean).length === 2
        ? { url: path, title: '' }
        : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});

async function doSearch(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  const form: Record<string, string> = {
    action: 'axn_filter_obras',
    posts_per_page: '21',
    search: query,
    paged: String(page),
  };
  const terms: string[] = [];
  let anyType = false;
  for (const [id, value] of Object.entries(filters)) {
    if (value !== true) continue;
    const [group, ...rest] = id.split('.');
    const val = rest.join('.');
    if (!val) continue;
    if (group === 'grp-alfabeto') form.letra = val;
    else terms.push(val);
    anyType = true;
  }
  if (!anyType) terms.push(...TYPES);
  // `terms[]` repeats: the form body is a record, so the values are sent as one raw string.
  const body = `${new URLSearchParamsLike({ ...form }).toString()}${terms.map((t) => `&terms%5B%5D=${encodeURIComponent(t)}`).join('')}`;
  const response = await http.post(`${BASE_URL}/wp-admin/admin-ajax.php`, body, {
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
  });
  const doc = html.load(response.body, { baseUrl: BASE_URL });
  const items = doc.select('a.axn-card').map(card);
  const hasNextPage = items.length > 1;
  if (hasNextPage) lastManga = items.pop();
  else if (lastManga) items.push(lastManga);
  return { items, hasNextPage };
}

class URLSearchParamsLike {
  constructor(private readonly values: Record<string, string>) {}
  toString(): string {
    return Object.entries(this.values)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }
}
