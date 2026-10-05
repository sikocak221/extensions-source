import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://raventard.xyz';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function figures(document: HtmlElement, selector: string): MangaSummary[] {
  const seen = new Set<string>();
  return document.select(selector).flatMap((figure): MangaSummary[] => {
    const href = figure.selectFirst('a')?.absUrl('href');
    if (!href) return [];
    const url = relativeUrl(href);
    if (seen.has(url)) return [];
    seen.add(url);
    return [
      {
        url,
        title: figure.selectFirst('figcaption')?.text() ?? '',
        thumbnailUrl: figure.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
}

interface Project {
  nombre: string;
  slug: string;
  portada: string;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load('/');
      return {
        items: figures(document, 'div#div-diario figure, div#div-semanal figure, div#div-mensual figure'),
        hasNextPage: false,
      };
    },
    async getLatest(): Promise<MangaPage> {
      return { items: figures(await load('/'), 'section.flex > div.grid > figure'), hasNextPage: false };
    },
    getFilters: () => [
      { type: 'header', label: "Limpie la barra de búsqueda y haga click en 'Filtrar' para mostrar todas las series." },
    ],
    async search(query: string, page: number): Promise<MangaPage> {
      if (!query) {
        const document = await load(`/comics?page=${page}`);
        return {
          items: figures(document, 'section.flex > div.grid > figure'),
          hasNextPage: document.selectFirst('nav > ul.pagination > li > a[rel=next]') !== null,
        };
      }
      if (query.length < 2) throw new Error('La búsqueda debe tener al menos 2 caracteres');
      // The catalog page embeds every series as `proyectos = [...]`; search filters it by title.
      const body = (await http.get(`${BASE_URL}/comics`, { headers })).body;
      const json = /proyectos\s*=\s*(\[[\s\S]+?])\s*;/.exec(body)?.[1];
      const projects = json ? (JSON.parse(json) as Project[]) : [];
      const needle = query.toLowerCase();
      return {
        items: projects
          .filter((p) => p.nombre.toLowerCase().includes(needle))
          .map((p) => ({ url: `/sr2/${p.slug}`, title: p.nombre, thumbnailUrl: p.portada })),
        hasNextPage: false,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const synopsis = document.selectFirst('section#section-sinopsis');
      const genres = synopsis
        ?.select('div.flex')
        .find((div) => div.select('div').some((d) => d.text().trim() === 'Géneros'))
        ?.select('div > a > span')
        .map((span) => span.text());
      return {
        url: manga.url,
        title: document.selectFirst('main.wrap-project')?.attr('data-project') || manga.title,
        thumbnailUrl: document.selectFirst('#coverProject')?.attr('src') || manga.thumbnailUrl,
        description:
          synopsis
            ?.select('p')
            .map((p) => p.text())
            .join(' ') || undefined,
        genres,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('section#section-list-cap div.grid > a').map((a) => {
        const datetime = a.selectFirst('time')?.attr('datetime');
        const time = datetime ? Date.parse(datetime) : Number.NaN;
        return {
          url: relativeUrl(a.absUrl('href') ?? a.attr('href') ?? ''),
          name: a.selectFirst('div#name')?.text() ?? '',
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      let document = html.load(response.body, { baseUrl: response.url });
      // The reader page posts a form (CSRF token + chapter) to the image host.
      const form = document.selectFirst('form#redirectForm[method=post]');
      if (form) {
        const fields: Record<string, string> = {};
        for (const input of form.select('input')) fields[input.attr('name') ?? ''] = input.attr('value') ?? '';
        const action = form.absUrl('action') ?? '';
        const posted = await http.post(action, { form: fields }, { headers: { ...headers, Referer: response.url } });
        document = html.load(posted.body, { baseUrl: posted.url });
      }
      return document
        .select('main.contenedor-imagen > section img[src], main > img[src]')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/sr2\/[^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
