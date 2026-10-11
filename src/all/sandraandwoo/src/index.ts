import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate } from './common/utils';

const BASE_URL = 'https://www.sandraandwoo.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const THUMBNAIL = `${BASE_URL}/images/fanart/fanart-contest-2014/pictures/zheng-qu-01-color-corrected.jpg`;

const SYNOPSIS: Record<string, string> = {
  de: 'Sandra und Woo ist ein Comedy-Webcomic mit dem zwölfjährigen Mädchen Sandra North und ihrem Waschbären Woo in den Hauptrollen. Zwar sollen die meisten Strips einfach nur lustig oder gewitzt sein, gelegentlich werden aber auch ernste Themen wie die Missachtung von Menschenrechten in Burma oder die Zerstörung der Natur angesprochen. Wir wollen außerdem zeigen, was es für Sandra und ihre Schulfreunde Cloud und Larisa bedeutet, erwachsen zu werden. Nicht vergessen werden sollten außerdem Woos Ausflüge in den nahen Wald um dort seine tierischen Freunde Shadow, ein Fuchs, und Sid, ein Eichhörnchen, zu treffen. Als weiteres Alleinstellungsmerkmal des Comics darf gelten, dass sich immer wieder einzelne Strips oder sogar längere Geschichten um die Nebenfiguren drehen.',
  en: 'Sandra and Woo is a comedy comic strip featuring the 13-year-old girl Sandra North and her mischievous pet raccoon Woo. While most strips are just supposed to be funny or tell an exciting story, some also deal with more serious topics. We also want to show what growing up means for Sandra and her best friends in middle school, Cloud and Larisa. Another regular feature of the comic are Woo’s trips to the forest to meet his furry friends Shadow (a fox) and Sid (a squirrel) and his love interest Lily.',
};

const TITLE_REGEX = /^Permanent Link:\s*((?:\[(\d{4})])?\s*(?:\[[^\]]*(\d{4})])?.*)$/;
const DATE_REGEX = /.*\/(\d+)\/(\d+)\/(\d+)\/[^/]*\//;

export default defineExtension({
  createSource: (info: SourceInfo) => {
    const de = info.lang === 'de';
    const name = de ? 'Sandra und Woo' : 'Sandra and Woo';
    const archive = de ? '/woode/archiv' : '/archive';
    const manga: MangaSummary = { url: archive, title: name, thumbnailUrl: THUMBNAIL };
    const one = async (): Promise<MangaPage> => ({ items: [manga], hasNextPage: false });

    return {
      baseUrl: BASE_URL,

      getPopular: one,

      async search(query: string): Promise<MangaPage> {
        const q = query.trim().toLowerCase();
        const match = !q || name.toLowerCase().includes(q) || 'oliver knörzer'.includes(q) || 'powree'.includes(q);
        return { items: match ? [manga] : [], hasNextPage: false };
      },

      async getMangaDetails(): Promise<MangaDetails> {
        return {
          ...manga,
          author: 'Oliver Knörzer',
          artist: 'Powree',
          description: SYNOPSIS[info.lang] ?? SYNOPSIS.en,
          genres: ['Comedy'],
          status: 'hiatus',
        };
      },

      async getChapters(): Promise<Chapter[]> {
        const response = await http.get(`${BASE_URL}${archive}`, { headers });
        const links = html.load(response.body, { baseUrl: response.url }).select('#column a').reverse();
        let last = 0;
        const chapters: Chapter[] = [];
        for (const [i, a] of links.entries()) {
          if (i % 300 === 0) await timers.sleep(0);
          const path = (a.attr('href') ?? '').replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0]!;
          const dateMatch = DATE_REGEX.exec(path);
          const uploadedAt = dateMatch
            ? parseDate(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`, 'yyyy-M-d')
            : undefined;
          const hover = a.attr('title') ?? '';
          const titleMatch = TITLE_REGEX.exec(hover);
          const title = titleMatch?.[1] ?? hover;
          const number = titleMatch?.[2] || titleMatch?.[3];
          const chapterNumber = number ? Number.parseFloat(number) : (last + Math.floor(last + 1)) / 2;
          last = chapterNumber;
          chapters.push({ url: path, name: title, number: chapterNumber, uploadedAt });
        }
        return chapters.reverse();
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const response = await http.get(`${BASE_URL}${chapter.url}`, { headers });
        const img = html.load(response.body, { baseUrl: response.url }).selectFirst('#comic img');
        return [{ index: 0, imageUrl: img?.absUrl('src') ?? '' }];
      },

      imageHeaders: () => headers,

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});
