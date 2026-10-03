import { type Filter, defineExtension } from '@matane/extension-sdk';
import { EZManhwa, SHOW_LOCKED_CHAPTERS_PREFERENCE } from './ezmanhwa/EZManhwa';

const GENRES = [
  { label: 'All', value: '' },
  { label: 'Acting', value: 'acting' },
  { label: 'Action', value: 'action' },
  { label: 'Action (Alt)', value: 'action-582' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Adventure (Alt)', value: 'adventure-589' },
  { label: 'Apocalypse', value: 'apocalypce' },
  { label: 'Comedy', value: 'comedy' },
  { label: 'Cooking', value: 'cooking' },
  { label: 'Crazy MC', value: 'crazy-mc' },
  { label: 'Cultivation', value: 'cultivation' },
  { label: 'Drama', value: 'drama' },
  { label: 'Ecchi', value: 'ecchi' },
  { label: 'Fantasy', value: 'fantasy' },
  { label: 'Fantasy (Alt)', value: 'fantasy-747' },
  { label: 'Fight', value: 'fight' },
  { label: 'Gender Bender', value: 'gender-bender' },
  { label: 'Harem', value: 'harem' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Historical', value: 'historical' },
  { label: 'Horror', value: 'horror' },
  { label: 'Josei', value: 'josei' },
  { label: 'Live', value: 'live' },
  { label: 'Magic', value: 'magic' },
  { label: 'Manhua', value: 'manhua' },
  { label: 'Martial Arts', value: 'martial-arts' },
  { label: 'Mature', value: 'mature' },
  { label: 'Mecha', value: 'mecha' },
  { label: 'Medieval Area', value: 'medieval-area' },
  { label: 'Munchkin', value: 'munchkin' },
  { label: 'Murim', value: 'murim' },
  { label: 'Mystery', value: 'mystery' },
  { label: 'Myth', value: 'myth' },
  { label: 'Politics', value: 'politics' },
  { label: 'Psychological', value: 'psychological' },
  { label: 'Reincarnation', value: 'reincarnation' },
  { label: 'Revenge', value: 'revenge' },
  { label: 'Romance', value: 'romance' },
  { label: 'School Life', value: 'school-life' },
  { label: 'Sci-Fi', value: 'sci-fi' },
  { label: 'Seinen', value: 'seinen' },
  { label: 'Shounen', value: 'shounen' },
  { label: 'Slice of Life', value: 'slice-of-life' },
  { label: 'Sports', value: 'sports' },
  { label: 'Supernatural', value: 'supernatural' },
  { label: 'Superpower', value: 'superpower' },
  { label: 'System', value: 'system' },
  { label: 'Taming', value: 'taming' },
  { label: 'Tower', value: 'tower' },
  { label: 'Tragedy', value: 'tragedy' },
  { label: 'Urban', value: 'urban' },
  { label: 'Vampires', value: 'vampiers' },
  { label: 'Virtual Reality', value: 'virtual-reality' },
  { label: 'Wuxia', value: 'wuxia' },
];

class QiScans extends EZManhwa {
  readonly name = 'Qi Scans';
  readonly baseUrl = 'https://qimanga.com';
  readonly apiUrl = 'https://api.qimanga.com/api/v1';

  override browseParams = ['sort', 'status', 'type', 'genre'];

  override getFilters(): Filter[] {
    return [...super.getFilters(), { type: 'select', id: 'genre', label: 'Genre', options: GENRES }];
  }
}

export default defineExtension({
  preferences: () => [SHOW_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new QiScans().toSource(),
});
