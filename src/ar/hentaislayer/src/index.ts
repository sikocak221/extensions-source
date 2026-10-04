import { type Preference, defineExtension } from '@matane/extension-sdk';
import { FuzzyDoodle } from './fuzzydoodle/FuzzyDoodle';

const LATEST_PREFERENCE: Preference = {
  type: 'select',
  key: 'LatestType',
  label: 'نوع القائمة الأحدث',
  description:
    'حدد نوع الإدخالات التي سيتم الاستعلام عنها لأحدث قائمة. الأنواع الأخرى متوفرة في الشائع/التصفح أو البحث',
  options: [
    { value: 'manga', label: 'مانجا' },
    { value: 'manhwa', label: 'مانهوا' },
    { value: 'comics', label: 'كوميكس' },
  ],
  default: 'manga',
};

class HentaiSlayer extends FuzzyDoodle {
  readonly name = 'Hentai Slayer';
  readonly baseUrl = 'https://hentaislayer.net';

  override latestPageUrl(page: number): string {
    return `${this.baseUrl}/latest-${prefs.get<string>(LATEST_PREFERENCE.key) ?? 'manga'}?page=${page}`;
  }
}

export default defineExtension({
  createSource: () => new HentaiSlayer().toSource(),
  preferences: () => [LATEST_PREFERENCE],
});
