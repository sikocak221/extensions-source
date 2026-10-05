import { defineExtension } from '@matane/extension-sdk';
import { parseArabicDate } from './arabic-date';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class _3asq extends MadaraNoAjax {
  readonly name = '3asq';
  readonly baseUrl = 'https://3asq.online';

  override chapterDateSelector = 'span.chapter-release-date .timediff';
  override parseChapterDate(date: string | null | undefined): number | undefined {
    return parseArabicDate(date);
  }
  override chapterMode = 'MangaAjax' as const;
  override archiveUrlSelector = 'div.post-title a:not([target])';
}

export default defineExtension({
  createSource: () => new _3asq().toSource(),
});
