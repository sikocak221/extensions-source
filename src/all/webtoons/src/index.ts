import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, ownText } from './common/utils';

const BASE_URL = 'https://www.webtoons.com';
const MOBILE_URL = 'https://m.webtoons.com';
const MAX_QUALITY = 'useMaxQuality';
const SEQUENTIAL = 'useSequentialNumbering';

const EPISODE_NO =
  /(?:(s(eason)?|saison|part|vol(ume)?)\s*\.?\s*(\d+).*?)?(.*?(mini|bonus|special).*?)?(e(p(isode)?)?|ch(apter)?)\s*\.?\s*(\d+(\.\d+)?)/i;

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: MAX_QUALITY,
      label: 'Use maximum quality images',
      description: 'Enable to load images in maximum quality.',
      default: false,
    },
    {
      type: 'switch',
      key: SEQUENTIAL,
      label: 'Use sequential chapter numbering',
      description: 'Enable to use sequential numbering instead of official episode numbers.',
      default: false,
    },
  ],
  createSource: (info) => {
    const langCode = info.lang.toLowerCase() === 'zh-hant' ? 'zh-hant' : info.lang;
    const locale = info.lang.toLowerCase() === 'zh-hant' ? 'zh_TW' : info.lang;
    const headers = {
      'User-Agent': USER_AGENT,
      Cookie: `ageGatePass=true; locale=${locale}; needGDPR=false`,
    };
    const mobileHeaders = { ...headers, Referer: `${MOBILE_URL}/` };

    const fetchHtml = async (url: string, h: Record<string, string> = headers) => {
      const res = await http.get(url, { headers: h });
      return html.load(res.body, { baseUrl: res.url });
    };

    const toManga = (doc: ReturnType<typeof html.load>): MangaPage['items'] =>
      doc.select('.webtoon_list li a').flatMap((a) => {
        const title = a.selectFirst('.title')?.text();
        const href = a.absUrl('href');
        if (!title || !href) return [];
        return [
          { url: href.replace(/^https?:\/\/[^/]+/, ''), title, thumbnailUrl: a.selectFirst('img')?.absUrl('src') },
        ];
      });

    const abs = (url: string) => (url.startsWith('http') ? url : BASE_URL + url);

    return {
      baseUrl: BASE_URL,
      imageHeaders: () => ({ Referer: `${BASE_URL}/` }),
      getWebUrl: (item) => abs(item.url),
      async getPopular(page) {
        const ranking = ['trending', 'popular', 'originals', 'canvas'][page - 1];
        if (!ranking) return { items: [], hasNextPage: false };
        const doc = await fetchHtml(`${BASE_URL}/${langCode}/ranking/${ranking}`);
        return { items: toManga(doc), hasNextPage: ranking !== 'canvas' };
      },
      async getLatest() {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const doc = await fetchHtml(`${BASE_URL}/${langCode}/originals/${days[new Date().getDay()]}?sortOrder=UPDATE`);
        return { items: toManga(doc), hasNextPage: false };
      },
      getFilters(): Filter[] {
        return [
          {
            type: 'select',
            id: 'type',
            label: 'Search Type',
            options: [
              { value: '', label: 'ALL' },
              { value: 'originals', label: 'Originals' },
              { value: 'canvas', label: 'Canvas' },
            ],
          },
        ];
      },
      async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
        const type = typeof filters.type === 'string' ? filters.type : '';
        let url = `${BASE_URL}/${langCode}/search${type ? `/${type}` : ''}?keyword=${encodeURIComponent(query)}`;
        if (page > 1 && type) url += `&page=${page}`;
        const doc = await fetchHtml(url);
        return { items: toManga(doc), hasNextPage: doc.selectFirst('a.pagination[aria-current=true] + a') != null };
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const doc = await fetchHtml(abs(manga.url));
        const detail = doc.selectFirst('.detail_header .info');
        const authors = detail?.select('.author') ?? [];
        const authorArea = detail?.selectFirst('.author_area');
        const own = (e: typeof authorArea) => (e ? ownText(e) : undefined);
        const author = own(authors[0] ?? null) || own(authorArea ?? null);
        const dayInfo = doc.selectFirst('#_asideDetail p.day_info')?.text() ?? '';
        return {
          url: manga.url,
          title: (doc.selectFirst('h1.subj, h3.subj') ?? doc.selectFirst('h1'))?.text().trim() ?? manga.title,
          author,
          artist: own(authors[1] ?? null) || own(authorArea ?? null) || author,
          genres: (detail?.select('.genre') ?? []).map((g) => g.text().trim()),
          description: doc.selectFirst('#_asideDetail p.summary')?.text().trim(),
          status: /UP|EVERY|NOUVEAU/.test(dayInfo)
            ? 'ongoing'
            : /END|COMPLETED|TERMINÉ/.test(dayInfo)
              ? 'completed'
              : 'unknown',
          thumbnailUrl: doc.selectFirst('head meta[property="og:image"]')?.attr('content') ?? manga.thumbnailUrl,
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const titleId = /[?&](?:title_no|titleNo)=(\d+)/.exec(manga.url)?.[1];
        if (!titleId) throw new Error('Unknown title id');
        const path = manga.url.split('?')[0]!.split('/').filter(Boolean);
        const canvas = manga.url.includes('episodeList') ? path[0] === 'challenge' : path[1] === 'canvas';
        const type = canvas ? 'canvas' : 'webtoon';
        const url = `${MOBILE_URL}/api/v1/${type}/${titleId}/episodes?pageSize=99999${
          canvas ? `&readingLanguageCode=${langCode}` : ''
        }`;
        const res = await http.get<{
          result: {
            episodeList: { episodeTitle: string; viewerLink: string; exposureDateMillis: number; hasBgm?: boolean }[];
          };
        }>(url, { headers: mobileHeaders, responseType: 'json' });
        const eps = res.body.result.episodeList.map((e) => {
          const m = EPISODE_NO.exec(e.episodeTitle);
          const ok = m && !m[6];
          return {
            e,
            num: ok ? Number(m[11]) : -1,
            season: ok && m[4] ? Number(m[4]) : 1,
          };
        });
        const unrecognized = eps.filter((x) => x.num === -1).length;
        if (prefs.get<boolean>(SEQUENTIAL) || unrecognized > eps.length - unrecognized) {
          eps.forEach((x, i) => (x.num = i + 1));
        } else {
          let max = 0;
          let season = 1;
          let offset = 0;
          eps.forEach((x, i) => {
            if (x.num !== -1) {
              const original = x.num;
              if (x.season > season) {
                season = x.season;
                if (original <= max) offset = max;
              }
              x.num = offset + original;
              max = Math.max(max, x.num);
            } else {
              x.num = i === 0 ? 0 : eps[i - 1]!.num + 0.01;
            }
          });
        }
        return eps
          .map(({ e, num }) => ({
            url: e.viewerLink.replace(/^https?:\/\/[^/]+/, ''),
            name: `${decodeEntities(e.episodeTitle)} (ch. ${fmt(num)})${e.hasBgm ? ' ♫' : ''}`,
            number: num,
            uploadedAt: e.exposureDateMillis,
          }))
          .reverse();
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const res = await http.get(abs(chapter.url), { headers });
        const doc = html.load(res.body, { baseUrl: res.url });
        const max = prefs.get<boolean>(MAX_QUALITY);
        const imgs = doc.select('div#_imageList > img');
        if (imgs.length) {
          return imgs.map((img, i) => {
            let url = img.attr('data-url') ?? '';
            if (max && /[?&]type=q90(&|$)/.test(url)) url = url.replace(/([?&])type=q90&?/, '$1').replace(/[?&]$/, '');
            return { index: i, imageUrl: url };
          });
        }
        // Motion toons.
        const docUrl = /documentURL:.*?'(.*?)'/.exec(res.body)?.[1];
        const path = /jpg:.*?'(.*?)\{/.exec(res.body)?.[1];
        if (!docUrl || !path) return [];
        const assets = (
          await http.get<{ assets: { images: Record<string, string> } }>(docUrl, { headers, responseType: 'json' })
        ).body.assets.images;
        return Object.entries(assets)
          .filter(([k]) => k.includes('layer'))
          .map(([, v], i) => ({ index: i, imageUrl: path + v }));
      },
    };
  },
});
