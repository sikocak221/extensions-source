import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';
import { signedUrl } from './vrf';

const BASE_URL = 'https://mangafire.to';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'application/json' };
const CONTENT_RATINGS = ['safe', 'suggestive', 'erotica', 'pornographic'];

const LANG_CODE: Record<string, string> = { 'es-419': 'es-la', 'pt-BR': 'pt-br' };

interface Poster {
  small?: string | null;
  medium?: string | null;
  large?: string | null;
}
interface MangaDto {
  hid: string;
  slug?: string | null;
  title: string;
  poster?: Poster | null;
  type?: string | null;
  status?: string | null;
  synopsisHtml?: string | null;
  authors?: { title: string }[];
  artists?: { title: string }[];
  genres?: { title: string }[];
  themes?: { title: string }[];
}

const titleUrl = (m: MangaDto) => `/title/${m.hid}${m.slug ? `-${m.slug}` : ''}`;
const posterUrl = (p?: Poster | null) => p?.large ?? p?.medium ?? p?.small ?? undefined;

const group = (id: string, label: string, options: [string, string][], tri = false): Filter => ({
  type: 'group',
  id,
  label,
  filters: options.map(([l, v]): Filter =>
    tri ? { type: 'tristate', id: `${id}:${v}`, label: l } : { type: 'checkbox', id: `${id}:${v}`, label: l },
  ),
});

const GENRES: [string, string][] = [
  ['Action', '1'], ['Adult', '268929'], ['Adventure', '78'], ['Avant Garde', '3'], ['Boys Love', '4'], ['Comedy', '5'],
  ['Crime', '268921'], ['Demons', '77'], ['Drama', '6'], ['Ecchi', '7'], ['Fantasy', '79'], ['Girls Love', '9'],
  ['Gourmet', '10'], ['Harem', '11'], ['Hentai', '268930'], ['Historical', '268922'], ['Horror', '530'], ['Isekai', '13'],
  ['Iyashikei', '531'], ['Josei', '15'], ['Kids', '532'], ['Magic', '539'], ['Magical Girls', '268923'],
  ['Mahou Shoujo', '533'], ['Martial Arts', '534'], ['Mature', '268931'], ['Mecha', '19'], ['Medical', '268924'],
  ['Military', '535'], ['Music', '21'], ['Mystery', '22'], ['Parody', '23'], ['Philosophical', '268925'],
  ['Psychological', '536'], ['Reverse Harem', '25'], ['Romance', '26'], ['School', '73'], ['Sci-Fi', '28'],
  ['Seinen', '537'], ['Shoujo', '30'], ['Shounen', '31'], ['Slice of Life', '538'], ['Smut', '268932'], ['Space', '33'],
  ['Sports', '34'], ['Super Power', '75'], ['Superhero', '268926'], ['Supernatural', '76'], ['Suspense', '37'],
  ['Thriller', '38'], ['Tragedy', '268927'], ['Vampire', '39'], ['Wuxia', '268928'],
]; // prettier-ignore
const THEMES: [string, string][] = [
  ['Aliens', '268933'], ['Animals', '268934'], ['Cooking', '268935'], ['Crossdressing', '268936'],
  ['Delinquents', '268937'], ['Demons', '268938'], ['Genderswap', '268939'], ['Ghosts', '268940'], ['Gyaru', '268941'],
  ['Harem', '268942'], ['Incest', '268943'], ['Loli', '268944'], ['Mafia', '268945'], ['Magic', '268946'],
  ['Martial Arts', '268947'], ['Military', '268948'], ['Monster Girls', '268949'], ['Monsters', '268950'],
  ['Music', '268951'], ['Ninja', '268952'], ['Office Workers', '268953'], ['Police', '268954'],
  ['Post-Apocalyptic', '268955'], ['Reincarnation', '268956'], ['Reverse Harem', '268957'], ['Samurai', '268958'],
  ['School Life', '268959'], ['Shota', '268960'], ['Supernatural', '268961'], ['Survival', '268962'],
  ['Time Travel', '268963'], ['Traditional Games', '268964'], ['Vampires', '268965'], ['Video Games', '268966'],
  ['Villainess', '268967'], ['Virtual Reality', '268968'], ['Zombies', '268969'],
]; // prettier-ignore
const SORTS: [string, string][] = [
  ['Latest update', 'chapter_updated_at:desc'], ['Best match', 'relevance:desc'], ['Recently added', 'created_at:desc'],
  ['Title (A–Z)', 'title:asc'], ['Title (Z–A)', 'title:desc'], ['Year (newest)', 'year:desc'], ['Year (oldest)', 'year:asc'],
  ['Highest rated', 'score:desc'], ['Most viewed · 7 days', 'views_7d:desc'], ['Most viewed · 30 days', 'views_30d:desc'],
  ['Most viewed · all time', 'views_total:desc'], ['Most followed', 'follows_total:desc'],
]; // prettier-ignore

export default defineExtension({
  preferences: () => [
    {
      type: 'multiselect',
      key: 'pref_content_rating',
      label: 'Content Rating (All by default)',
      options: CONTENT_RATINGS.map((r) => ({ label: r.charAt(0).toUpperCase() + r.slice(1), value: r })),
      default: [],
    },
    {
      type: 'switch',
      key: 'show_as_volumes',
      label: 'Prefer Volume Release',
      description: 'Requires Chapter List Refresh to Apply',
      default: false,
    },
    {
      type: 'switch',
      key: 'merge_chapters',
      label: 'Merge duplicate chapters',
      description: 'Requires Chapter List Refresh to Apply',
      default: false,
    },
    { type: 'switch', key: 'prefer_official', label: 'Prefer official chapters', default: true },
  ],

  createSource: (info: SourceInfo) => {
    const langCode = LANG_CODE[info.lang] ?? info.lang;
    const contentRating = () => prefs.get<string[]>('pref_content_rating') ?? [];

    const getJson = async <T>(path: string, params: [string, string][] = []): Promise<T> =>
      (await http.get<T>(signedUrl(BASE_URL, path, params), { headers, responseType: 'json' })).body;

    const hidOf = (url: string) => {
      const last = url.replace(/\/$/, '').split('/').pop()!;
      return last.includes('.') ? last.split('.').pop()! : last.includes('-') ? last.split('-')[0]! : last;
    };

    const toSummary = (m: MangaDto): MangaSummary => ({
      url: titleUrl(m),
      title: m.title,
      thumbnailUrl: posterUrl(m.poster),
    });

    async function list(params: [string, string][], page: number): Promise<MangaPage> {
      const result = await getJson<{ items: MangaDto[]; meta?: { hasNext?: boolean } }>('/api/titles', [
        ...params,
        ['page', String(page)],
        ['limit', '50'],
      ]);
      return { items: result.items.map(toSummary), hasNextPage: result.meta?.hasNext ?? false };
    }

    const ratingParams = (): [string, string][] => contentRating().map((r) => ['content_rating[]', r]);

    return {
      baseUrl: BASE_URL,

      getPopular: (page: number) => list([['order[views_30d]', 'desc'], ...ratingParams()], page),

      getLatest: (page: number) => list([['order[chapter_updated_at]', 'desc'], ...ratingParams()], page),

      getFilters(): Filter[] {
        const defaults = new Set(contentRating());
        return [
          {
            type: 'group',
            id: 'rating',
            label: 'Content Rating',
            filters: CONTENT_RATINGS.map((r): Filter => ({
              type: 'checkbox',
              id: `rating:${r}`,
              label: r.charAt(0).toUpperCase() + r.slice(1),
              default: defaults.has(r),
            })),
          },
          group('type', 'Type', [
            ['Manga', 'manga'],
            ['Manhwa', 'manhwa'],
            ['Manhua', 'manhua'],
            ['Other', 'other'],
          ]),
          {
            type: 'select',
            id: 'mode',
            label: 'Genre and theme match mode',
            options: [
              { label: 'AND', value: 'and' },
              { label: 'OR', value: 'or' },
            ],
          },
          group('genre', 'Genres', GENRES, true),
          group('theme', 'Themes', THEMES),
          group('status', 'Status', [
            ['Releasing', 'releasing'],
            ['Finished', 'finished'],
            ['On Hiatus', 'on_hiatus'],
            ['Discontinued', 'discontinued'],
            ['Not Yet Released', 'not_yet_released'],
          ]),
          { type: 'text', id: 'author', label: 'Author / Artist' },
          { type: 'text', id: 'yearFrom', label: 'Release year (From)' },
          { type: 'text', id: 'yearTo', label: 'Release year (To)' },
          { type: 'text', id: 'minChap', label: 'Minimum chapters' },
          {
            type: 'select',
            id: 'sort',
            label: 'Sort by',
            default: 'relevance:desc',
            options: SORTS.map(([label, value]) => ({ label, value })),
          },
        ];
      },

      async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
        const params: [string, string][] = [];
        const author = typeof state.author === 'string' ? state.author.trim() : '';
        if (author) {
          const tags = await getJson<{ data: { id: number; type: string }[] }>('/api/tags', [['keyword', author]]);
          const tag = tags.data.find((t) => t.type === 'author' || t.type === 'artist');
          if (!tag) return { items: [], hasNextPage: false };
          params.push(['authors[]', String(tag.id)]);
        }
        if (query.trim()) params.push(['keyword', query.trim()]);
        for (const [key, value] of Object.entries(state)) {
          if (value === true) {
            const [kind, id] = key.split(':') as [string, string];
            const param = { rating: 'content_rating[]', type: 'types[]', theme: 'theme_ids[]', status: 'statuses[]' }[
              kind
            ];
            if (param) params.push([param, id]);
          } else if (value === 'include' && key.startsWith('genre:')) params.push(['genres_in[]', key.slice(6)]);
          else if (value === 'exclude' && key.startsWith('genre:')) params.push(['genres_ex[]', key.slice(6)]);
        }
        if (typeof state.mode === 'string') params.push(['genres_mode', state.mode], ['theme_mode', state.mode]);
        const num = (id: string) => {
          const n = Number.parseInt(String(state[id] ?? ''), 10);
          return Number.isNaN(n) ? undefined : n;
        };
        if (num('yearFrom') !== undefined) params.push(['year_from', String(num('yearFrom'))]);
        if (num('yearTo') !== undefined) params.push(['year_to', String(num('yearTo'))]);
        if ((num('minChap') ?? 0) > 0) params.push(['min_chap', String(num('minChap'))]);
        const sort = typeof state.sort === 'string' ? state.sort : 'relevance:desc';
        const [sortKey, sortDir] = sort.split(':') as [string, string];
        params.push([`order[${sortKey}]`, sortDir]);
        return list(params, page);
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const { data } = await getJson<{ data: MangaDto }>(`/api/titles/${hidOf(manga.url)}`);
        const status = (
          { releasing: 'ongoing', finished: 'completed', on_hiatus: 'hiatus', discontinued: 'cancelled' } as Record<
            string,
            MangaStatus
          >
        )[(data.status ?? '').toLowerCase()];
        return {
          url: titleUrl(data),
          title: data.title,
          thumbnailUrl: posterUrl(data.poster) ?? manga.thumbnailUrl,
          author: data.authors?.map((a) => a.title).join(', '),
          artist: data.artists?.map((a) => a.title).join(', '),
          description: data.synopsisHtml ? html.load(`<div>${data.synopsisHtml}</div>`).text() : undefined,
          genres: [
            ...(data.type ? [data.type.charAt(0).toUpperCase() + data.type.slice(1)] : []),
            ...(data.genres ?? []).map((g) => g.title),
            ...(data.themes ?? []).map((t) => t.title),
          ],
          status: status ?? 'unknown',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const hid = hidOf(manga.url);
        let asVolumes = prefs.get<boolean>('show_as_volumes') === true;
        const chapters: (Chapter & { type: string })[] = [];
        if (asVolumes) {
          const volumes = (
            await getJson<{
              items: { id: number; number: number; name?: string | null; chapterCount: number; language: string }[];
            }>(`/api/titles/${hid}/volumes`)
          ).items;
          if (volumes.length) {
            for (const v of volumes.filter((x) => x.language === langCode)) {
              chapters.push({
                url: `${manga.url}/volume/${v.id}`,
                name: `Vol. ${v.number}${v.name?.trim() ? ` - ${v.name}` : ''}`,
                number: v.number,
                scanlator: `${v.chapterCount} chapters`,
                type: 'volume',
              });
            }
          } else asVolumes = false;
        }
        if (!asVolumes) {
          type Item = {
            id: number;
            number: number;
            name?: string | null;
            createdAt?: number | null;
            type?: string | null;
          };
          const page = (n: number) =>
            getJson<{ items: Item[]; meta?: { lastPage?: number } }>(`/api/titles/${hid}/chapters`, [
              ['language', langCode], ['sort', 'number'], ['order', 'desc'], ['page', String(n)], ['limit', '200'],
            ]); // prettier-ignore
          const first = await page(1);
          const items = [...first.items];
          for (let n = 2; n <= (first.meta?.lastPage ?? 1); n++) {
            items.push(...(await page(n)).items);
            await timers.sleep(0);
          }
          const trim = (n: number) => String(n).replace(/\.0$/, '');
          for (const c of items) {
            const name = c.name?.trim();
            const extracted = name
              ? Number.parseFloat(/(?:\b(?:ch(?:\.|apter)?|ep(?:\.|isode)?)\s?)(\d+(?:\.\d+)?)/i.exec(name)?.[1] ?? '')
              : Number.NaN;
            chapters.push({
              url: `${manga.url}/${c.id}-chapter-${trim(c.number)}-${langCode}`,
              name: !name
                ? `Ch. ${trim(c.number)}`
                : Number.isNaN(extracted)
                  ? `Ch. ${trim(c.number)} - ${name}`
                  : name,
              number: Number.isNaN(extracted) ? c.number : extracted,
              scanlator: c.type ?? 'Unknown',
              uploadedAt: c.createdAt ? c.createdAt * 1000 : undefined,
              type: 'chapter',
            });
          }
          if (prefs.get<boolean>('merge_chapters') === true) {
            const preferOfficial = prefs.get<boolean>('prefer_official') !== false;
            const sorted = [...chapters].sort((a, b) => {
              const rank = (c: Chapter) => ((c.scanlator ?? '').toLowerCase() === 'official' ? 1 : 0);
              return preferOfficial ? rank(b) - rank(a) : rank(a) - rank(b);
            });
            const seen = new Set<number | undefined>();
            return sorted
              .filter((c) => !seen.has(c.number) && seen.add(c.number))
              .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
          }
        }
        return chapters;
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const last = chapter.url.split('/').pop()!;
        let path: string;
        if (chapter.url.includes('/volume/')) path = `/api/volumes/${last}`;
        else {
          const id = Number.parseInt(last.split('-')[0]!, 10);
          if (Number.isNaN(id)) throw new Error('Refresh the chapter list');
          path = `/api/chapters/${id}`;
        }
        const data = await getJson<{ data: { pages: { url: string }[] } }>(path);
        return data.data.pages.map((p, index) => ({ index, imageUrl: p.url }));
      },

      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?mangafire\.to(\/title\/[^/?#]+)/i.exec(url.trim());
        return match ? { url: match[1]!, title: '' } : null;
      },

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});
