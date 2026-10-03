import { type Filter, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Mihentai extends MangaThemesia {
  readonly name = 'Mihentai';
  readonly baseUrl = 'https://mihentai.net';

  override statusOptions = [
    { label: 'All', value: '' },
    { label: 'Publishing', value: 'publishing' },
    { label: 'Finished', value: 'finished' },
    { label: 'Dropped', value: 'drop' },
  ];

  override typeFilterOptions = [
    { label: 'Default', value: '' },
    { label: 'Manga', value: 'Manga' },
    { label: 'Manhwa', value: 'Manhwa' },
    { label: 'Manhua', value: 'Manhua' },
    { label: 'Webtoon', value: 'webtoon' },
    { label: 'One-Shot', value: 'One-Shot' },
    { label: 'Doujin', value: 'doujin' },
  ];

  override async getFilters(): Promise<Filter[]> {
    const filters = await super.getFilters();
    return filters.filter((f) => !('id' in f) || !['author', 'year'].includes(f.id));
  }
}

export default defineExtension({
  createSource: () => new Mihentai().toSource(),
});
