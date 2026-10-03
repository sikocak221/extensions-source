import { type Filter, defineExtension } from '@matane/extension-sdk';
import { MangaReader } from './mangareader/MangaReader';

const TYPES = [
  { label: 'All', value: '' },
  { label: 'Manga', value: '8' },
  { label: 'Manhua', value: '53' },
  { label: 'Manhwa', value: '39' },
  { label: 'OEL', value: '169' },
  { label: 'Web Comic', value: '344' },
  { label: 'Webtoon', value: '983' },
];
const STATUSES = [
  { label: 'All', value: '' },
  { label: 'Completed', value: 'completed' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'On-hiatus', value: 'on-hiatus' },
  { label: 'Discontinued', value: 'discontinued' },
  { label: 'Not-yet-published', value: 'not-yet-published' },
];
const SCORES = [
  { label: 'All', value: '' },
  { label: '(1) Appalling', value: '1' },
  { label: '(2) Horrible', value: '2' },
  { label: '(3) Very Bad', value: '3' },
  { label: '(4) Bad', value: '4' },
  { label: '(5) Average', value: '5' },
  { label: '(6) Fine', value: '6' },
  { label: '(7) Good', value: '7' },
  { label: '(8) Very Good', value: '8' },
  { label: '(9) Great', value: '9' },
  { label: '(10) Masterpiece', value: '10' },
];
const GENRES = [
  { label: 'Action', value: '1' },
  { label: 'Adventure', value: '2' },
  { label: 'Animated', value: '641' },
  { label: 'Anime', value: '375' },
  { label: 'Cartoon', value: '463' },
  { label: 'Comedy', value: '3' },
  { label: 'Comic', value: '200' },
  { label: 'Completed', value: '326' },
  { label: 'Cooking', value: '133' },
  { label: 'Detective', value: '386' },
  { label: 'Doujinshi', value: '534' },
  { label: 'Drama', value: '10' },
  { label: 'Ecchi', value: '41' },
  { label: 'Fantasy', value: '17' },
  { label: 'Gender Bender', value: '89' },
  { label: 'Harem', value: '11' },
  { label: 'Historical', value: '30' },
  { label: 'Horror', value: '21' },
  { label: 'Isekai', value: '70' },
  { label: 'Josei', value: '67' },
  { label: 'Magic', value: '420' },
  { label: 'Manga', value: '137' },
  { label: 'Manhua', value: '51' },
  { label: 'Manhwa', value: '79' },
  { label: 'Martial Arts', value: '12' },
  { label: 'Mature', value: '22' },
  { label: 'Mecha', value: '72' },
  { label: 'Military', value: '1180' },
  { label: 'Mystery', value: '44' },
  { label: 'One shot', value: '721' },
  { label: 'Psychological', value: '23' },
  { label: 'Reincarnation', value: '1603' },
  { label: 'Romance', value: '13' },
  { label: 'School Life', value: '4' },
  { label: 'Sci-fi', value: '24' },
  { label: 'Seinen', value: '25' },
  { label: 'Shoujo', value: '33' },
  { label: 'Shoujo Ai', value: '123' },
  { label: 'Shounen', value: '5' },
  { label: 'Shounen Ai', value: '680' },
  { label: 'Slice of Life', value: '14' },
  { label: 'Smut', value: '734' },
  { label: 'Sports', value: '142' },
  { label: 'Super Power', value: '28' },
  { label: 'Supernatural', value: '6' },
  { label: 'Thriller', value: '1816' },
  { label: 'Tragedy', value: '97' },
  { label: 'Webtoon', value: '60' },
];

class MangaNow extends MangaReader {
  readonly name = 'MangaNow';
  readonly baseUrl = 'https://manganow.to';
  readonly lang = 'en';

  override multiSelectJoin = { genres: ',' };

  override pageListParseSelector(): string {
    return '.container-reader-chapter > .iv-card:not([data-url$="manganow.jpg"])';
  }

  override getFilters(): Filter[] {
    const next = new Date().getFullYear() + 1;
    const years = [
      { label: 'All', value: '' },
      ...Array.from({ length: next - 1917 }, (_, i) => String(next - 1 - i)).map((y) => ({ label: y, value: y })),
    ];
    return [
      { type: 'header', label: 'NOTE: Ignored if using text search!' },
      { type: 'separator' },
      { type: 'select', id: 'type', label: 'Type', options: TYPES },
      { type: 'select', id: 'status', label: 'Status', options: STATUSES },
      { type: 'select', id: 'score', label: 'Score', options: SCORES },
      { type: 'select', id: 'sy', label: 'Release Year', options: years },
      this.getSortFilter(),
      {
        type: 'group',
        id: 'genres',
        label: 'Genres',
        filters: GENRES.map((g) => ({ type: 'checkbox', id: `genres.${g.value}`, label: g.label })),
      },
    ];
  }
}

export default defineExtension({
  createSource: () => new MangaNow().toSource(),
});
