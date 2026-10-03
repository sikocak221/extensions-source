import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';
import { parseDate } from './madara/MadaraBase';

class OtaScans extends Madara {
  readonly name = 'Ota Scans';
  readonly baseUrl = 'https://yurilab.top';

  override mangaSubString = 'series';
  override mangaDetailsSelectorTitle = 'h1.post-title';
  override chapterMode = 'MangaAjaxPaginated' as const;
  override chapterDatePattern = 'd MMMM yyyy';

  override archiveSelector(): string {
    return 'div.manga__item';
  }

  // Dates of this year are written without the year ("12 March").
  override parseChapterDate(date: string | null | undefined): number | undefined {
    const parsed = super.parseChapterDate(date);
    if (parsed !== undefined || !date) return parsed;
    const time = parseDate(date.trim(), 'd MMMM');
    if (time === undefined) return undefined;
    const value = new Date(time);
    if (time > Date.now()) value.setUTCFullYear(value.getUTCFullYear() - 1);
    return value.getTime();
  }
}

export default defineExtension({
  createSource: () => new OtaScans().toSource(),
});
