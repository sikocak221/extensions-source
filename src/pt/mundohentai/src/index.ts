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
import { USER_AGENT, hostOf, relativeUrl, selectFirstIgnoreCase, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://mundohentaioficial.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const TAGS: [string, string][] = [
  ['-- Selecione --', ''],
  ['Ahegao', 'ahegao'],
  ['Anal', 'anal'],
  ['Biquíni', 'biquini'],
  ['Chubby', 'chubby'],
  ['Colegial', 'colegial'],
  ['Creampie', 'creampie'],
  ['Dark Skin', 'dark-skin'],
  ['Dupla Penetração', 'dupla-penetracao'],
  ['Espanhola', 'espanhola'],
  ['Exibicionismo', 'exibicionismo'],
  ['Footjob', 'footjob'],
  ['Furry', 'furry'],
  ['Futanari', 'futanari'],
  ['Grupal', 'grupal'],
  ['Incesto', 'incesto'],
  ['Lingerie', 'lingerie'],
  ['MILF', 'milf'],
  ['Maiô', 'maio'],
  ['Masturbação', 'masturbacao'],
  ['Netorare', 'netorare'],
  ['Oral', 'oral'],
  ['Peitinhos', 'peitinhos'],
  ['Preservativo', 'preservativo'],
  ['Professora', 'professora'],
  ['Sex Toys', 'sex-toys'],
  ['Tentáculos', 'tentaculos'],
  ['Yaoi', 'yaoi'],
];

async function load(url: string, referer?: string) {
  const response = await http.get(url, { headers: referer ? { ...headers, Referer: referer } : headers });
  return html.load(response.body, { baseUrl: response.url });
}

function fromElement(element: HtmlElement): MangaSummary {
  return {
    title: element.selectFirst('span.thumb-titulo')?.text().trim() ?? '',
    thumbnailUrl: element.selectFirst('img.attachment-post-thumbnail')?.attr('src') || undefined,
    url: relativeUrl(element.selectFirst('a:has(span.thumb-imagem)')?.attr('href') ?? ''),
  };
}

function parseList(document: HtmlElement, excludeSubbed: boolean): MangaPage {
  const selector = `div.lista > ul > li div.thumb-conteudo:has(a[href^=${BASE_URL}]):not(:contains(Tufos))${
    excludeSubbed ? ':not(:has(span.selo-tipo:contains(Legendado)))' : ''
  }`;
  return {
    items: selectIgnoreCase(document, selector).map(fromElement),
    hasNextPage: document.selectFirst('ul.paginacao li.next') !== null,
  };
}

async function popular(page: number): Promise<MangaPage> {
  const referer = page === 1 ? BASE_URL : `${BASE_URL}/category/doujinshi/page/${page - 1}`;
  const document = await load(`${BASE_URL}/category/doujinshi/${page !== 1 ? `page/${page}` : ''}`, referer);
  return parseList(document, false);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: popular,
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Os filtros são ignorados na busca!' },
      {
        type: 'select',
        id: 'tag',
        label: 'Tag',
        default: '',
        options: TAGS.map(([label, value]) => ({ label, value })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query) return parseList(await load(`${BASE_URL}/?s=${encodeURIComponent(query)}`), true);
      const tag = typeof filters.tag === 'string' ? filters.tag : '';
      if (!tag) return popular(page);
      const referer = page === 1 ? `${BASE_URL}/tags` : `${BASE_URL}/tag/${tag}/page/${page - 1}`;
      const document = await load(`${BASE_URL}/tag/${tag}/${page !== 1 ? `page/${page}` : ''}`, referer);
      return parseList(document, true);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(BASE_URL + manga.url);
      const post = document.selectFirst('div.post-box');
      const item = (label: string) => selectIgnoreCase(post ?? document, `ul.post-itens li:contains(${label})`);
      return {
        url: manga.url,
        title: manga.title,
        author:
          item('Artista:')[0]
            ?.select('a')
            .map((a) => a.text().trim())
            .join(' ') || undefined,
        genres:
          item('Tags:')[0]
            ?.select('a')
            .map((a) => a.text().trim()) ?? [],
        description: item('Cor:')[0]?.text().trim(),
        status: 'completed',
        thumbnailUrl: post?.selectFirst('div.post-capa img')?.attr('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(BASE_URL + manga.url);
      const multiple = document.select('div.listaImagens div.galeriaTab');
      if (multiple.length === 0) return [{ url: manga.url, name: 'Capítulo', number: 1 }];
      return multiple
        .map((element): Chapter => {
          const id = element.attr('data-id') ?? '';
          const title = element.selectFirst('div.galeriaTabTitulo')?.text().trim();
          return {
            name: `Capítulo ${id}${title ? ` - ${title}` : ''}`,
            number: Number.parseFloat(id) || -1,
            url: `${manga.url}#${id}`,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [path = '', id = ''] = chapter.url.split('#');
      const document = await load(BASE_URL + path);
      const images = id
        ? document.select(`div.listaImagens #galeria-${id} img`)
        : document.select('div.listaImagens ul.post-fotos img');
      return images.map((el, index) => ({ index, url: BASE_URL + path, imageUrl: el.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url.split('#')[0],
  }),
});
