import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ManhwaNex extends Madara {
  readonly name = 'ManhwaNex';
  override statusFilterOptions = [
    { label: 'Completed', value: 'end' },
    { label: 'Ongoing', value: 'on-going' },
    { label: 'Canceled', value: 'canceled' },
    { label: 'On Hold', value: 'on-hold' },
    { label: 'Upcoming', value: 'upcoming' },
  ];
  readonly baseUrl = 'https://manhwanex.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new ManhwaNex().toSource(),
});
