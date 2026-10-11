import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://horahentai.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const CATEGORIES: [string, string][] = [
  ['Todas', ''],
  ['Doujinshi', 'doujinshi'],
  ['Mangá Hentai', 'manga-hentai'],
  ['Comics', 'comics'],
  ['Sem Censura', 'hentai-sem-censura'],
];

async function load(url: string) {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: url });
}

const pagePath = (page: number) => (page > 1 ? `page/${page}/` : '');

function parseListing(document: HtmlElement): MangaPage {
  const items = document.select('.lista li.novo-card-item a.novo-card-link-img').map((element): MangaSummary => ({
    url: relativeUrl(element.absUrl('href') ?? element.attr('href') ?? ''),
    title: element.attr('title') ?? '',
    thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
  }));
  // The same post can appear twice in a listing.
  const seen = new Set<string>();
  return {
    items: items.filter((m) => !seen.has(m.url) && seen.add(m.url)),
    hasNextPage: document.selectFirst('ul.paginacao li.next a') !== null,
  };
}

async function fetchListing(listingUrl: string, page: number): Promise<MangaPage> {
  return parseListing(await load(listingUrl + pagePath(page)));
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => fetchListing(`${BASE_URL}/popular/`, page),
    getLatest: (page) => fetchListing(`${BASE_URL}/`, page),
    async getFilters(): Promise<Filter[]> {
      const tags: { name: string; slug: string }[] = [];
      try {
        const document = await load(`${BASE_URL}/tags/`);
        const seen = new Set<string>();
        for (const a of document.select('.lista-tags a[href*=/tag/]')) {
          const slug = relativeUrl(a.absUrl('href') ?? '').split('/')[2];
          const name = a.attr('title') || a.text().trim();
          if (slug && name && !seen.has(slug)) {
            seen.add(slug);
            tags.push({ name, slug });
          }
        }
        tags.sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        // tags are optional
      }
      return [
        { type: 'header', label: 'Filtros são ignorados na busca por texto' },
        {
          type: 'select',
          id: 'category',
          label: 'Categoria',
          default: '',
          options: CATEGORIES.map(([label, value]) => ({ label, value })),
        },
        ...(tags.length
          ? [
              {
                type: 'select' as const,
                id: 'tag',
                label: 'Tag',
                default: '',
                options: [{ label: 'Todas', value: '' }, ...tags.map((t) => ({ label: t.name, value: t.slug }))],
              },
            ]
          : []),
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        return parseListing(await load(`${BASE_URL}/${pagePath(page)}?s=${encodeURIComponent(query.trim())}`));
      }
      const tag = typeof filters.tag === 'string' ? filters.tag : '';
      const category = typeof filters.category === 'string' ? filters.category : '';
      if (tag) return fetchListing(`${BASE_URL}/tag/${tag}/`, page);
      if (category) return fetchListing(`${BASE_URL}/category/${category}/`, page);
      return fetchListing(`${BASE_URL}/`, page);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(BASE_URL + manga.url);
      return {
        url: manga.url,
        title: document.selectFirst('h1.post-titulo')?.text().trim() ?? manga.title,
        thumbnailUrl: document.selectFirst('.post-capa img')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('h1.post-titulo + .form-group')?.text().trim(),
        genres: document
          .select('ul.post-itens a[href*=/category/] .postTagNome, ul.post-itens a[href*=/tag/] .postTagNome')
          .map((e) => e.text().trim()),
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(BASE_URL + manga.url);
      const published = Date.parse(
        document.selectFirst('meta[property=article:published_time]')?.attr('content') ?? '',
      );
      const date = Number.isNaN(published) ? undefined : published;
      const galleries = document.select('div.galeriaTabItem');
      if (galleries.length === 0) return [{ url: manga.url, name: 'Capítulo', number: 1, uploadedAt: date }];
      const chapters: Chapter[] = [];
      for (const item of galleries) {
        const galleryId = item.selectFirst('div.galeriaConteudo')?.attr('id');
        if (!galleryId || !/^galeria-\d+$/.test(galleryId)) continue;
        const label = item.selectFirst('.galeriaTabCapitulo')?.text().trim() ?? '';
        const title = item.selectFirst('.galeriaTabTitulo')?.text().trim() ?? '';
        const number = /(\d+(?:\.\d+)?)/.exec(label)?.[1];
        chapters.push({
          // Every gallery lives on the same page, so the anchor makes a chapter unique.
          url: `${manga.url}#${galleryId}`,
          name: !label ? title || 'Capítulo' : !title ? label : `${label}: ${title}`,
          number: number ? Number(number) : -1,
          uploadedAt: date,
        });
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [path = '', galleryId = ''] = chapter.url.split('#');
      const document = await load(BASE_URL + path);
      const images = galleryId
        ? document.select(`div.galeriaConteudo#${galleryId} img`)
        : document.select('ul.post-fotos li img');
      return images.map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url.split('#')[0],
  }),
});
