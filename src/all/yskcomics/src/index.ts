import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, htmlToText } from './common/utils';

const BASE_URL = 'https://www.ysk-comics.com';
const API_URL = 'https://api.ysk-comics.com';

interface Named {
  name: string;
}
interface Meta {
  link_next: string | null;
}

function rating(rate: string, count: number): string {
  const v = parseFloat(rate) || 0;
  const stars =
    v >= 4.75
      ? '★★★★★'
      : v >= 4.25
        ? '★★★★✬'
        : v >= 3.75
          ? '★★★★☆'
          : v >= 3.25
            ? '★★★✬☆'
            : v >= 2.75
              ? '★★★☆☆'
              : v >= 2.25
                ? '★★✬☆☆'
                : v >= 1.75
                  ? '★★☆☆☆'
                  : v >= 1.25
                    ? '★✬☆☆☆'
                    : v >= 0.75
                      ? '★☆☆☆☆'
                      : v >= 0.25
                        ? '✬☆☆☆☆'
                        : '☆☆☆☆☆';
  return v > 0 ? `${stars} ${rate}${count > 0 ? ` (${count})` : ''}` : '';
}

const slugOf = (path: string) => path.split('?')[0]!.split('/').filter(Boolean).pop()!;

export default defineExtension({
  createSource: (info) => {
    const lang = info.lang;
    const headers = { 'User-Agent': USER_AGENT, 'x-localization': lang };
    const get = async <T>(url: string) => (await http.get<T>(url, { headers, responseType: 'json' })).body;
    const url = (slug: string) => `/${lang}/comic/${slug}`;

    return {
      baseUrl: BASE_URL,
      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
      async getPopular(): Promise<MangaPage> {
        const r = await get<{
          data: { image: string; full_name: string; slug: string }[];
        }>(`${BASE_URL}/api/home/best-comics`);
        return {
          items: r.data.map((m) => ({ url: url(m.slug), title: m.full_name, thumbnailUrl: m.image })),
          hasNextPage: false,
        };
      },
      async getLatest(page): Promise<MangaPage> {
        const r = await get<{
          data: { data_messages: { image: string; full_name: string; slug: string }[]; meta: Meta };
        }>(`${BASE_URL}/api/home/latest-comics?page=${page}`);
        return {
          items: r.data.data_messages.map((m) => ({ url: url(m.slug), title: m.full_name, thumbnailUrl: m.image })),
          hasNextPage: r.data.meta.link_next != null,
        };
      },
      async search(query): Promise<MangaPage> {
        if (query.trim().length < 3) throw new Error('Search query must be at least 3 characters');
        const r = await get<{ data: { image: string; full_name: string; slug: string }[] }>(
          `${API_URL}/api/v1/search-comics-home?name=${encodeURIComponent(query)}`,
        );
        return {
          items: r.data.map((m) => ({ url: url(m.slug), title: m.full_name, thumbnailUrl: m.image })),
          hasNextPage: false,
        };
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const d = (
          await get<{
            data: {
              full_name: string;
              slug: string;
              image: string;
              rate: string;
              rate_count: number;
              language_code: string;
              writer: Named;
              publisher: Named;
              genres: Named[];
              artists: Named[];
              status: string;
              description: string;
              published_at: string;
            };
          }>(`${BASE_URL}/api/comic/${slugOf(manga.url)}`)
        ).data;
        let description = '';
        if (lang !== d.language_code) description += `**Sorry, this content is not available in ${lang}.**\n\n`;
        const r = rating(d.rate, d.rate_count);
        if (r) description += `${r}\n`;
        description += `Publisher: ${d.publisher.name}\nPublished at: ${d.published_at}\n\n${htmlToText(d.description).trim()}`;
        return {
          url: url(d.slug),
          title: d.full_name,
          thumbnailUrl: d.image,
          author: d.writer.name,
          artist: d.artists.map((a) => a.name).join(', ') || undefined,
          genres: d.genres.map((g) => g.name),
          description,
          status: d.status === 'ongoing' ? 'ongoing' : d.status === 'completed' ? 'completed' : 'unknown',
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const slug = slugOf(manga.url);
        const all: Chapter[] = [];
        for (let page = 1; ; page++) {
          const r = await get<{ data: { data_messages: { slug: string; rank: string }[]; meta: Meta } }>(
            `${BASE_URL}/api/comic/chapter/${slug}?page=${page}`,
          );
          for (const c of r.data.data_messages) all.push({ url: `/${lang}/chapter/${c.slug}`, name: `#${c.rank}` });
          if (r.data.meta.link_next == null) break;
        }
        return all.reverse();
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const r = await get<{ data: string[] }>(`${BASE_URL}/api/chapters/images/${slugOf(chapter.url)}`);
        return r.data.map((imageUrl, index) => ({ index, imageUrl }));
      },
      getWebUrl: (item) => BASE_URL + item.url,
    };
  },
});
