import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://www.toptoon.net';
// The age check is a cookie the site sets after the visitor confirms being an adult.
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Cookie: 'adultStatus=1; preConfirmAdult=1' };
const AGE_ERROR = '请到WebView确认年满18岁';

interface MangaDto {
  meta: { title: string; author: { authorString: string } };
  // "standard" can be either a string or an array
  thumbnail: { standard: string | string[] };
  id: string;
  // can be an empty array or an object
  lastUpdated: { pubDate?: string } | unknown[];
}

const pubDate = (dto: MangaDto) => (Array.isArray(dto.lastUpdated) ? '0' : (dto.lastUpdated.pubDate ?? '0'));

function summary(dto: MangaDto): MangaSummary & { author: string } {
  const standard = Array.isArray(dto.thumbnail.standard) ? dto.thumbnail.standard[0] : dto.thumbnail.standard;
  return {
    url: `/comic/epList/${dto.id}`,
    title: dto.meta.title,
    author: dto.meta.author.authorString,
    thumbnailUrl: `https://tw-contents-image.toptoon.net${standard}`,
  };
}

async function fetchAllManga(): Promise<MangaDto[]> {
  const page = await http.get(`${BASE_URL}/search`, { headers });
  const jsonUrl = page.body.split("var jsonFileUrl = '")[1]?.split("'")[0];
  if (!jsonUrl) throw new Error('Search index not found');
  const response = await http.get<Record<string, MangaDto>>(`https:${jsonUrl}`, { headers, responseType: 'json' });
  return Object.values(response.body);
}

const strip = ({ title, url, thumbnailUrl }: MangaSummary & { author: string }): MangaSummary => ({
  url,
  title,
  thumbnailUrl,
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const page = await http.get(`${BASE_URL}/ranking`, { headers });
      const jsonUrl = page.body.split('jsonFileUrl: ["')[1]?.split('"')[0]?.replace(/\\\//g, '/');
      if (!jsonUrl) throw new Error('Ranking not found');
      const response = await http.get<{ adult: MangaDto[] }>(`https:${jsonUrl}`, { headers, responseType: 'json' });
      return { items: response.body.adult.map((dto) => strip(summary(dto))), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const all = (await fetchAllManga()).sort((a, b) => pubDate(b).localeCompare(pubDate(a)));
      return { items: all.map((dto) => strip(summary(dto))), hasNextPage: false };
    },
    async search(query): Promise<MangaPage> {
      const needle = query.toLowerCase();
      const items = (await fetchAllManga())
        .map(summary)
        .filter((m) => m.title.toLowerCase().includes(needle) || m.author.toLowerCase().includes(needle));
      return { items: items.map(strip), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      if (response.url.replace(BASE_URL, '').replace(/^\/+/, '').split(/[/?#]/)[0] === '') throw new Error(AGE_ERROR);
      const document = html.load(response.body, { baseUrl: response.url });
      const etc = document.selectFirst('section.infoContent div.etc')?.text() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('section.infoContent div.title')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('div.comicThumb img')?.absUrl('src') || manga.thumbnailUrl,
        author: etc.split('作家 : ')[1]?.split('|')[0]?.trim() || undefined,
        description: document.selectFirst('div.comic_story div.desc')?.text() || undefined,
        genres: document
          .selectFirst('section.infoContent div.hashTag')
          ?.text()
          .split('#')
          .map((t) => t.trim())
          .filter(Boolean),
        status: document.selectFirst('div.etc span.comicDayBox')
          ? 'ongoing'
          : document.selectFirst('div.hashTag a[href="/search/keyword/79"]')
            ? 'completed'
            : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      if (response.url.replace(BASE_URL, '').replace(/^\/+/, '').split(/[/?#]/)[0] === '') throw new Error(AGE_ERROR);
      const document = html.load(response.body, { baseUrl: response.url });
      return document
        .select('section.episode_area ul.list_area li.episodeBox')
        .map((box): Chapter => {
          const locked = box.selectFirst('button.coin, button.gift, button.waitFree') != null;
          return {
            url: (box.selectFirst('a')?.absUrl('href') ?? '').replace(BASE_URL, ''),
            name: `${locked ? '🔒' : ''}${box.selectFirst('div.title')?.text() ?? ''} ${box.selectFirst('div.subTitle')?.text() ?? ''}`,
            uploadedAt: parseDate(box.selectFirst('div.pubDate')?.text(), 'yyyy-MM-dd'),
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const segments = response.url.replace(BASE_URL, '').split(/[?#]/)[0]!.split('/').slice(1);
      if (segments[0] === '') throw new Error(AGE_ERROR);
      if (segments.length < 2 || segments[1] !== 'epView') throw new Error('请确认是否已登录解锁');
      const document = html.load(response.body, { baseUrl: response.url });
      return document
        .select('article.epContent section.imgWrap div.cImg img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') ?? '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/comic\/epList\/[^/?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
