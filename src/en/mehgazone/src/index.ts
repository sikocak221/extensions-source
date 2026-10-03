import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, htmlToText } from './common/utils';

const BASE_URL = 'https://mehgazone.com';
const PREFERENCES: Preference[] = [
  {
    type: 'text',
    key: 'WORDPRESS_USERNAME',
    label: 'WordPress username',
    description: 'For Patreon-locked posts: see https://bodysuit23.mehgazone.com/wp-admin/profile.php',
    default: '',
  },
  {
    type: 'text',
    key: 'WORDPRESS_APP_PASSWORD',
    label: 'WordPress app password',
    description: 'An app password (not your account password), created on the same profile page. Stored as plain text.',
    default: '',
  },
];

// Each comic is a WordPress site on its own subdomain: manga urls are "/<subdomain>", chapter urls
// "/<subdomain>/?p=<post id>".
const siteOf = (url: string) => `https://${url.split('/')[1]}.mehgazone.com`;

function headers(api = false): Record<string, string> {
  const user = prefs.get<string>('WORDPRESS_USERNAME')?.trim();
  const password = prefs.get<string>('WORDPRESS_APP_PASSWORD')?.trim();
  const auth: Record<string, string> =
    api && user && password ? { Authorization: `Basic ${base64.encode(`${user}:${password}`)}` } : {};
  return { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, ...auth };
}

async function catalogue(): Promise<MangaPage> {
  const document = html.load((await http.get(BASE_URL, { headers: headers() })).body);
  const sidebar = document.selectFirst('#main aside.primary-sidebar .sidebar-group')?.html() ?? '';
  // "Latest ... "Title"" headings are followed by the comic's feed link and cover.
  const items: MangaSummary[] = [];
  for (const part of sidebar.split(/<h2/i).slice(1)) {
    const heading = htmlToText(`<h2${part.split(/<\/h2>/i)[0]}`);
    if (!/latest/i.test(heading)) continue;
    const feed = /href="https?:\/\/([a-z0-9-]+)\.mehgazone\.com[^"]*\/feed/i.exec(part)?.[1];
    if (!feed) continue;
    items.push({
      url: `/${feed}`,
      title: decodeEntities(heading.split('"')[1] ?? heading),
      thumbnailUrl: /<img[^>]+src="([^"]+)"/i.exec(part)?.[1],
    });
  }
  return { items, hasNextPage: false };
}

export default defineExtension({
  preferences: () => PREFERENCES,
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => catalogue(),
    search: async (query) => {
      const all = await catalogue();
      return { ...all, items: all.items.filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase())) };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = html.load((await http.get(siteOf(manga.url), { headers: headers() })).body);
      const thumb = document
        .select('#content img[src*=".png"]')
        .map((img) => img.attr('src') ?? '')
        .find((src) => /\/[^/]+-(\d+\.png)$/i.test(src));
      return {
        url: manga.url,
        title: decodeEntities(document.selectFirst('title')?.text() ?? manga.title),
        author: 'Patricia Barton',
        status: 'ongoing',
        thumbnailUrl: thumb?.replace(/\/[^/]+-(\d+\.png)$/i, '/$1') ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const posts: { id: number; date_gmt: string; title: { rendered: string }; excerpt: { rendered: string } }[] = [];
      for (let page = 1, more = true; more; page++) {
        const response = await http.get<typeof posts>(
          `${siteOf(manga.url)}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,date_gmt,excerpt`,
          {
            headers: headers(true),
            responseType: 'json',
          },
        );
        posts.push(...response.body);
        const total = Number(
          Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'x-wp-totalpages')?.[1],
        );
        more = total ? page < total : response.body.length === 100;
      }
      const seen = new Set<number>();
      return posts
        .filter(
          (p) => !p.excerpt.rendered.includes('Unlock with Patreon') && !seen.has(p.id) && Boolean(seen.add(p.id)),
        )
        .sort((a, b) => a.date_gmt.localeCompare(b.date_gmt))
        .map((p, i) => ({
          url: `${manga.url}/?p=${p.id}`,
          name: decodeEntities(p.title.rendered) || p.date_gmt.split('T')[0]!,
          number: i,
          uploadedAt: Date.parse(`${p.date_gmt}Z`) || undefined,
        }))
        .reverse();
    },
    // Not ported: the post excerpt rendered as a text page.
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('?p=')[1];
      const posts = (
        await http.get<{ content: { rendered: string } }[]>(
          `${siteOf(chapter.url)}/wp-json/wp/v2/posts?per_page=1&_fields=link,content&include=${id}`,
          { headers: headers(true), responseType: 'json' },
        )
      ).body;
      const content = posts[0]?.content.rendered ?? '';
      return [...content.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m, index) => ({
        index,
        imageUrl: decodeEntities(m[1]!),
      }));
    },
    imageHeaders: () => headers(),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([a-z0-9-]+)\.mehgazone\.com/i.exec(url.trim());
      return match && match[1] !== 'www' ? { url: `/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) =>
      `${siteOf(item.url)}${item.url.slice(item.url.indexOf('/', 1) < 0 ? item.url.length : item.url.indexOf('/', 1))}`,
  }),
});
