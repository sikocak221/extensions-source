import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

const THAI_MONTHS: [string, string][] = [
  ['มกราคม', 'January'],
  ['กุมภาพันธ์', 'February'],
  ['มีนาคม', 'March'],
  ['เมษายน', 'April'],
  ['พฤษภาคม', 'May'],
  ['มิถุนายน', 'June'],
  ['กรกฎาคม', 'July'],
  ['สิงหาคม', 'August'],
  ['กันยายน', 'September'],
  ['ตุลาคม', 'October'],
  ['พฤศจิกายน', 'November'],
  ['ธันวาคม', 'December'],
];

class MangaLc extends Madara {
  readonly name = 'Manga-Lc';
  readonly baseUrl = 'https://manga-lc.net';

  override chapterDatePattern = 'd MMMM yyyy';
  override pageListParseSelector = '.reading-content img';
  override filterNonMangaItems = false;

  // The sites write months in Thai ("25 กันยายน 2026").
  override parseChapterDate(date: string | null | undefined): number | undefined {
    return super.parseChapterDate(
      date && THAI_MONTHS.reduce((text, [thai, english]) => text.replace(thai, english), date),
    );
  }
}

export default defineExtension({
  createSource: () => new MangaLc().toSource(),
});
