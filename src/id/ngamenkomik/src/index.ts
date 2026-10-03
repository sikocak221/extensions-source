import { type FilterOption, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class NgamenKomik extends ZeistManga {
  readonly name = 'NgamenKomik';
  readonly baseUrl = 'https://ngamenkomik05.blogspot.com';

  override hasFilters = true;
  override hasLanguageFilter = false;

  override getTypeList(): FilterOption[] {
    return [
      { label: 'Semua', value: '' },
      { label: 'Manhua', value: 'Manhua' },
      { label: 'Manhwa', value: 'Manhwa' },
    ];
  }

  override getStatusList(): FilterOption[] {
    return [
      { label: 'Semua', value: '' },
      { label: 'Ongoing', value: 'Ongoing' },
      { label: 'Completed', value: 'Completed' },
    ];
  }

  override getGenreList(): FilterOption[] {
    return [
      'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Harem', 'Horror', 'Isekai', 'Magic',
      'Martial Arts', 'Mystery', 'Reincarnation', 'Romance', 'School Life', 'Shounen', 'Slice of Life',
      'Supernatural', 'Thriller',
    ].map((genre) => ({ label: genre, value: genre })); // prettier-ignore
  }
}

export default defineExtension({
  createSource: () => new NgamenKomik().toSource(),
});
