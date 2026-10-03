import { defineExtension } from '@matane/extension-sdk';
import { LoneSeal, OVERLOADED_GENRES } from './loneseal/LoneSeal';

class DreamTeamsScans extends LoneSeal {
  readonly name = 'DreamTeams Scans';
  readonly baseUrl = 'https://dreamteams.space';

  override urlLayout = 'LEGACY_ROOT' as const;
  override includeChapterTitle = true;
  override includeSeriesTagFilter = true;
  override overloadedGenres = [...OVERLOADED_GENRES, 'yaoi'];
}

export default defineExtension({
  createSource: () => new DreamTeamsScans().toSource(),
});
