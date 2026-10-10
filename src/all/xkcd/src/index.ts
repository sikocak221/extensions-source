import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASES: Record<string, string> = {
  en: 'https://xkcd.com',
  es: 'https://es.xkcd.com',
  zh: 'https://xkcd.tw',
  fr: 'https://xkcd.lapin.org',
  ru: 'https://xkcd.ru',
};
const ENGLISH = 'https://xkcd.com';
const ORG_PREF = 'organization_method';

const ARCHIVE: Record<string, string> = { fr: '/tous-episodes.php', ru: '/img', zh: '/api/strips.json' };
const CREATOR: Record<string, string> = { ru: 'Рэндел Манро', zh: '兰德尔·门罗' };
const SYNOPSIS: Record<string, string> = {
  es: 'Un webcómic sobre romance, sarcasmo, mates y lenguaje.',
  fr: 'Un webcomic sarcastique qui parle de romance, de maths et de langage.',
  ru: 'о романтике, сарказме, математике и языке',
  zh: '這裡翻譯某個關於浪漫、諷刺、數學、以及語言的漫畫',
};
const SYNOPSIS_EN = 'A webcomic of romance, sarcasm, math and language.';
const INTERACTIVE: Record<string, string> = {
  es: 'Para experimentar la versión interactiva de este cómic, ábralo en WebView/navegador.',
  zh: '要體驗本漫畫的互動版請在WebView/瀏覽器中打開。',
};
const INTERACTIVE_EN = 'To experience the interactive version of this comic, open it in WebView/browser.';

const headers = { 'User-Agent': USER_AGENT };

/** "2026-1-9" → epoch ms (UTC). */
function stamp(text: string | undefined): number | undefined {
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text ?? '');
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

interface Entry {
  url: string;
  name: string;
  number: number;
  date?: number;
}

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: ORG_PREF,
      label: 'Organization Method',
      description: 'How comics are grouped into series. Reading progress is tied to the method.',
      options: [
        { value: 'SINGLE', label: 'Single manga (all comics)' },
        { value: 'BY_YEAR', label: 'By year' },
        { value: 'BY_YEAR_MONTH', label: 'By year-month' },
      ],
      default: 'SINGLE',
    },
  ],
  createSource: (info) => {
    const lang = info.lang;
    const baseUrl = BASES[lang] ?? ENGLISH;
    const creator = CREATOR[lang] ?? 'Randall Munroe';
    const synopsis = SYNOPSIS[lang] ?? SYNOPSIS_EN;
    const interactive = INTERACTIVE[lang] ?? INTERACTIVE_EN;
    const imageSelector =
      { es: '#middleContent .strip', fr: '#content .s', ru: '.main', zh: '#content > img:not([id])' }[lang] ??
      '#comic > img';

    const loadHtml = async (url: string) => {
      const res = await http.get(url, { headers });
      return html.load(res.body, { baseUrl: res.url });
    };

    let englishDates: Map<number, string> | undefined;
    const getEnglishDates = async () => {
      if (englishDates) return englishDates;
      englishDates = new Map();
      try {
        const doc = await loadHtml(`${ENGLISH}/archive/`);
        for (const a of doc.select('#middleContainer > a')) {
          const n = parseInt((a.attr('href') ?? '').replace(/\//g, ''), 10);
          if (n) englishDates.set(n, a.attr('title') ?? '');
        }
      } catch {
        // dates are optional
      }
      return englishDates;
    };

    const rel = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');

    async function allEntries(): Promise<Entry[]> {
      const dates = lang === 'en' ? new Map<number, string>() : await getEnglishDates();
      const dateOf = (n: number) => stamp(dates.get(n));
      if (lang === 'zh') {
        const res = await http.get<Record<string, { id: number; title: string }>>(`${baseUrl}${ARCHIVE.zh}`, {
          headers,
          responseType: 'json',
        });
        return Object.values(res.body).map((s) => ({
          url: `/${s.id}`,
          name: `${s.id}: ${s.title}`,
          number: s.id,
          date: dateOf(s.id),
        }));
      }
      const doc = await loadHtml(`${baseUrl}${ARCHIVE[lang] ?? '/archive'}`);
      const out: Entry[] = [];
      if (lang === 'es') {
        const byDate = new Map<string, number>();
        for (const [n, d] of dates) {
          const p = d.split('-');
          byDate.set(p.length === 3 ? `${p[0]}-${p[1]!.padStart(2, '0')}-${p[2]!.padStart(2, '0')}` : d, n);
        }
        for (const e of doc.select('.archive-entry')) {
          const a = e.selectFirst('a');
          const datePart = e.selectFirst('time')?.text().trim();
          if (!a || !datePart) continue;
          const url = rel(a.absUrl('href') ?? '');
          const number = url === '/strips/geografia/' ? 1472 : byDate.get(datePart);
          if (!number) continue;
          out.push({ url, name: `${number}: ${a.text().trim()}`, number, date: stamp(datePart) });
        }
      } else if (lang === 'fr') {
        for (const a of doc.select('#content .s > a')) {
          const href = a.absUrl('href') ?? '';
          if (!href.includes('=')) continue;
          const number = parseInt(href.split('=').pop() ?? '', 10) || 0;
          out.push({ url: rel(href), name: `${number}: ${a.text().trim()}`, number, date: dateOf(number) });
        }
        out.reverse();
      } else if (lang === 'ru') {
        for (const a of doc.select('.main > a')) {
          const href = a.absUrl('href') ?? '';
          const number = parseInt(rel(href).replace(/\//g, ''), 10) || 0;
          const title = a.selectFirst('img')?.attr('alt') ?? '';
          out.push({ url: rel(href), name: `${number}: ${title}`, number, date: dateOf(number) });
        }
      } else {
        for (const a of doc.select('#middleContainer > a')) {
          const href = a.absUrl('href') ?? '';
          const number = parseInt(rel(href).replace(/\//g, ''), 10) || 0;
          out.push({ url: rel(href), name: `${number}: ${a.text().trim()}`, number, date: stamp(a.attr('title')) });
        }
      }
      return out;
    }

    let cache: { at: number; entries: Entry[] } | undefined;
    const entries = async () => {
      if (!cache || Date.now() - cache.at > 3600_000) cache = { at: Date.now(), entries: await allEntries() };
      return cache.entries;
    };

    const method = () => prefs.get<string>(ORG_PREF) ?? 'SINGLE';
    const keyOf = (e: Entry) => {
      const m = method();
      if (m === 'SINGLE') return 'SINGLE';
      const d = new Date(e.date ?? 0);
      const y = String(d.getUTCFullYear());
      return m === 'BY_YEAR' ? y : `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const titleOf = (key: string) => (key === 'SINGLE' ? 'xkcd' : `xkcd ${key}`);
    const summary = (key: string): MangaSummary => ({ url: `/${key}`, title: titleOf(key) });

    return {
      baseUrl,
      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${baseUrl}/` }),
      async getPopular(page): Promise<MangaPage> {
        const keys = [...new Set((await entries()).map(keyOf))].sort().reverse();
        const per = 10;
        const slice = keys.slice((page - 1) * per, page * per);
        return { items: slice.map(summary), hasNextPage: page * per < keys.length };
      },
      async search(query): Promise<MangaPage> {
        const q = query.trim().toLowerCase();
        const keys = [...new Set((await entries()).map(keyOf))].sort().reverse();
        return { items: keys.filter((k) => titleOf(k).toLowerCase().includes(q)).map(summary), hasNextPage: false };
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        return {
          url: manga.url,
          title: titleOf(manga.url.slice(1)),
          author: creator,
          artist: creator,
          description: synopsis,
          status: 'ongoing',
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        return (await entries())
          .filter((e) => keyOf(e) === manga.url.slice(1))
          .map((e) => ({ url: e.url, name: e.name, number: e.number, uploadedAt: e.date }));
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const doc = await loadHtml(baseUrl + chapter.url);
        const container = doc.selectFirst(imageSelector);
        if (!container) throw new Error(interactive);
        let img = container;
        if (lang === 'fr') img = container.selectFirst("img[src^='strips/']") ?? container;
        else if (lang === 'ru') img = container.selectFirst("img[src*='/i/']") ?? container;
        else if (lang === 'en' || lang === 'es') {
          // interactive comics have more than one element inside the container
          if (doc.select(`${imageSelector} + *`).length) throw new Error(interactive);
        }
        let image = img.absUrl('src') ?? '';
        if ((lang === 'en' || lang === 'es') && img.attr('srcset')) {
          image = (img.attr('srcset') ?? '').split(' ')[0]!;
          if (!image.startsWith('http')) image = img.absUrl('src') ?? image;
        }
        if (!image) throw new Error(interactive);
        return [{ index: 0, imageUrl: image }];
      },
      getWebUrl: (item) => (item.url.match(/^\/(SINGLE|\d{4}(-\d\d)?)$/) ? baseUrl : baseUrl + item.url),
    };
  },
});
