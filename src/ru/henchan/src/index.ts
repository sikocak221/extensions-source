import type {
  Chapter,
  Filter,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaSummary,
  Page,
} from '@matane/extension-sdk';
import { defineExtension } from '@matane/extension-sdk';
import { MultiChan } from './multichan/MultiChan';
import { absoluteUrl, relativeUrl, withQuery } from './multichan/utils';

// Tag ids as on the site; the filter label is the id with spaces and a capital.
const GENRES = [
  '3D',
  'action',
  'ahegao',
  'bdsm',
  'corruption',
  'foot_fetish',
  'footfuck',
  'gender_bender',
  'live',
  'lolcon',
  'megane',
  'mind_break',
  'monstergirl',
  'netorare',
  'netori',
  'nipple_penetration',
  'oyakodon',
  'paizuri_(titsfuck)',
  'rpg',
  'scat',
  'shemale',
  'shimaidon',
  'shooter',
  'simulation',
  'skinsuit',
  'tomboy',
  'tomgirl',
  'x-ray',
  'алкоголь',
  'анал',
  'андроид',
  'анилингус',
  'анимация',
  'аркада',
  'арт',
  'бабушка',
  'без_текста',
  'без_трусиков',
  'без_цензуры',
  'беременность',
  'бикини',
  'близнецы',
  'боди-арт',
  'больница',
  'большая_грудь',
  'большие_попки',
  'бондаж',
  'буккаке',
  'в_ванной',
  'в_общественном_месте',
  'в_первый_раз',
  'в_цвете',
  'в_школе',
  'вампиры',
  'веб',
  'вебкам',
  'вибратор',
  'визуальная_новелла',
  'внучка',
  'волосатые_женщины',
  'гаремник',
  'гг_девушка',
  'гг_парень',
  'гипноз',
  'глубокий_минет',
  'горячий_источник',
  'грудастая_лоли',
  'групповой_секс',
  'гяру_и_гангуро',
  'двойное_проникновение',
  'девочки_волшебницы',
  'девушка_туалет',
  'демоны',
  'дилдо',
  'дочь',
  'драма',
  'дыра_в_стене',
  'жестокость',
  'за_деньги',
  'зомби',
  'зрелые_женщины',
  'измена',
  'изнасилование',
  'инопланетяне',
  'инцест',
  'исполнение_желаний',
  'камера',
  'квест',
  'кимоно',
  'колготки',
  'комиксы',
  'косплей',
  'кремпай',
  'кудере',
  'кузина',
  'куннилингус',
  'купальники',
  'латекс_и_кожа',
  'магия',
  'маленькая_грудь',
  'мастурбация',
  'мать',
  'мейдочки',
  'мерзкий_дядька',
  'минет',
  'много_девушек',
  'молоко',
  'монашки',
  'монстры',
  'мочеиспускание',
  'мужская_озвучка',
  'мужчина_крепкого_телосложения',
  'мускулистые_женщины',
  'на_природе',
  'наблюдение',
  'непрямой_инцест',
  'новелла',
  'обмен_партнерами',
  'обмен_телами',
  'обычный_секс',
  'огромная_грудь',
  'огромный_член',
  'оплодотворение',
  'остановка_времени',
  'парень_пассив',
  'переодевание',
  'песочница',
  'племянница',
  'пляж',
  'подглядывание',
  'подчинение',
  'похищение',
  'презерватив',
  'принуждение',
  'прозрачная_одежда',
  'проникновение_в_матку',
  'психические_отклонения',
  'публично',
  'рабыни',
  'романтика',
  'сверхъестественное',
  'секс_игрушки',
  'сестра',
  'сетакон',
  'скрытный_секс',
  'спортивная_форма',
  'спящие',
  'страпон',
  'суккубы',
  'темнокожие',
  'тентакли',
  'толстушки',
  'трап',
  'тётя',
  'умеренная_жестокость',
  'учитель_и_ученик',
  'ушастые',
  'фантазии',
  'фантастика',
  'фемдом',
  'фестиваль',
  'фетиш',
  'фистинг',
  'фурри',
  'футанари',
  'футанари_имеет_парня',
  'фэнтези',
  'хоррор',
  'цундере',
  'чикан',
  'чирлидеры',
  'чулки',
  'школьная_форма',
  'школьники',
  'школьницы',
  'школьный_купальник',
  'щекотка',
  'эксгибиционизм',
  'эльфы',
  'эччи',
  'юмор',
  'юри',
  'яндере',
  'яой',
];

const ORDERS = [
  ['date', 'Дата'],
  ['popularity', 'Популярность'],
  ['name', 'Алфавит'],
] as const;

// Order parts for a tag listing / the plain listing, ascending then descending. The site renamed its
// "new manga" listing to /manga/newest and the "most favorites" page is down, so popularity uses the
// favourites order of the newest listing (what the tag listings use).
const WITH_GENRES = [
  ['&n=dateasc', ''],
  ['&n=favasc', '&n=favdesc'],
  ['&n=abcdesc', '&n=abcasc'],
] as const;
const WITHOUT_GENRES = [
  ['manga/newest&n=dateasc', 'manga/newest'],
  ['manga/newest&n=favasc', 'manga/newest&n=favdesc'],
  ['manga/newest&n=abcdesc', 'manga/newest&n=abcasc'],
] as const;

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** "05 марта 2020" */
function russianDate(text: string): number | undefined {
  const match = /(\d{1,2})\s+([^\s\d]+)\s+(\d{4})/.exec(text);
  const month = match ? MONTHS.indexOf(match[2]!.toLowerCase()) : -1;
  return match && month >= 0 ? Date.UTC(Number(match[3]), month, Number(match[1])) : undefined;
}

const CHAPTER_NUMBER_REGEX = /(глава\s|часть\s)([0-9]+\.?[0-9]*)/i;

class HenChan extends MultiChan {
  readonly name = 'HenChan';
  readonly baseUrl = 'https://xxl.hentaichan.live';

  override popularUrl(page: number): string {
    return `${this.baseUrl}/${WITHOUT_GENRES[1][1]}?offset=${20 * (page - 1)}`;
  }

  override latestUpdatesUrl(page: number): string {
    return `${this.baseUrl}/manga/newest?offset=${20 * (page - 1)}`;
  }

  searchMangaUrl(page: number, query: string, filters: FilterState): string {
    if (query) {
      return withQuery(this.baseUrl, {
        do: 'search',
        subaction: 'search',
        story: query,
        search_start: String(page),
      });
    }
    const genres = GENRES.flatMap((genre) => {
      const state = filters[`genre.${genre}`];
      return state === 'include' ? [genre] : state === 'exclude' ? [`-${genre}`] : [];
    }).join('+');
    const sort = typeof filters.order === 'object' ? filters.order : { value: 'popularity', ascending: false };
    const index = Math.max(
      ORDERS.findIndex(([value]) => value === sort.value),
      0,
    );
    const side = sort.ascending ? 0 : 1;
    const offset = `offset=${20 * (page - 1)}`;
    return genres
      ? `${this.baseUrl}/tags/${genres}&sort=manga${WITH_GENRES[index]![side]}?${offset}`
      : `${this.baseUrl}/${WITHOUT_GENRES[index]![side]}?${offset}`;
  }

  override isSearchResult(element: HtmlElement): boolean {
    return !element.select('div.item').some((item) => /^\s*Тип/.test(item.text()) && item.select('*').length === 0);
  }

  /** High quality cover: the list thumbnails are small ("manganew_thumbs"), the full ones sit next to them. */
  hqThumbnail(url: string | undefined): string | undefined {
    return url
      ?.replace(/(?<=\/)manganew_thumbs\w*?(?=\/)/i, 'showfull_retina/manga')
      .replace(`_${this.baseUrl.replace(/^https?:\/\//, '')}`, '_hentaichan.ru');
  }

  override popularMangaFromElement(element: HtmlElement): MangaSummary {
    const manga = super.popularMangaFromElement(element);
    return { ...manga, thumbnailUrl: this.hqThumbnail(element.selectFirst('img')?.absUrl('src') || undefined) };
  }

  override mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details = super.mangaDetailsParse(document, manga);
    return { ...details, thumbnailUrl: this.hqThumbnail(document.selectFirst('img#cover')?.absUrl('src')) };
  }

  override chapterListSelector(): string {
    return '.related';
  }

  override chapterFromElement(element: HtmlElement): Chapter {
    const link = element.selectFirst('h2 a');
    const name = link?.attr('title') ?? '';
    const number = CHAPTER_NUMBER_REGEX.exec(name)?.[2];
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      name,
      number: number ? Number.parseFloat(number) : undefined,
    };
  }

  override async fetchChapterList(manga: MangaSummary, mangaPage: HtmlElement): Promise<Chapter[]> {
    // Galleries from the blurred ("exhentai") section are one chapter: the manga page itself.
    if (mangaPage.selectFirst('img#cover')?.attr('src')?.includes('/manganew_thumbs_blur/'))
      return this.chapterListParse(mangaPage, absoluteUrl(this.baseUrl, manga.url));

    const response = await http.request<string>({
      url: absoluteUrl(this.baseUrl, manga.url.replace('/manga/', '/related/')),
      headers: this.headers(),
    });
    if (response.status === 404) return [{ url: manga.url, name: 'Chapter', number: 1 }]; // beyond the last page
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    return this.chapterListParse(html.load(response.body, { baseUrl: response.url }), response.url);
  }

  private async chapterListParse(document: HtmlElement, responseUrl: string): Promise<Chapter[]> {
    // exhentai chapter
    if (responseUrl.includes('/manga/')) {
      return [
        {
          url: relativeUrl(responseUrl),
          name: document.selectFirst('a.title_top_a')?.text() ?? '',
          number: 1,
          uploadedAt: russianDate(document.selectFirst('div.row4_right b')?.text() ?? ''),
        },
      ];
    }

    // one chapter, nothing related
    const relatedText = document.selectFirst('#right > div:nth-child(4)')?.text() ?? '';
    if (relatedText.includes(' похожий на ')) {
      const link = document.selectFirst('#left > div > a');
      return [
        {
          url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
          name: relatedText.split(' похожий на ')[1]!.replace(/\\"/g, '"').replace(/\\'/g, "'"),
          number: 1,
        },
      ];
    }

    // has related chapters
    const result = document.select(this.chapterListSelector()).map((e) => this.chapterFromElement(e));
    let next = this.nextRelatedPage(document);
    while (next) {
      const page = await this.fetchDocument(next);
      result.push(...page.select(this.chapterListSelector()).map((e) => this.chapterFromElement(e)));
      next = this.nextRelatedPage(page);
    }
    return result.filter((c) => c.url && c.name).reverse();
  }

  private nextRelatedPage(document: HtmlElement): string {
    const link = document.select('div#pagination_related a').find((a) => a.text().includes('Вперед'));
    return link?.absUrl('href') || '';
  }

  override async getPages(chapter: Chapter): Promise<Page[]> {
    const path = chapter.url.includes('/manga/') ? chapter.url.replace('/manga/', '/online/') : chapter.url;
    const response = await http.get(absoluteUrl(this.baseUrl, path), {
      headers: { ...this.headers(), Accept: 'image/webp,image/apng' },
    });
    return this.pageListParse(response.body);
  }

  override pageListParse(body: string): Page[] {
    const prefix = 'fullimg": [';
    const begin = body.indexOf(prefix) + prefix.length;
    return body
      .slice(begin, body.indexOf(']', begin))
      .replace(/["']/g, '')
      .split(', ')
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  getFilters(): Filter[] {
    return [
      {
        type: 'sort',
        id: 'order',
        label: 'Сортировка',
        options: ORDERS.map(([value, label]) => ({ value, label })),
        default: { value: 'popularity', ascending: false },
      },
      {
        type: 'group',
        id: 'genres',
        label: 'Тэги',
        filters: GENRES.map((genre): Filter => ({
          type: 'tristate',
          id: `genre.${genre}`,
          label: genre.replace(/_/g, ' ').replace(/^./u, (c) => c.toUpperCase()),
        })),
      },
    ];
  }
}

export default defineExtension({
  createSource: () => new HenChan().toSource(),
});
