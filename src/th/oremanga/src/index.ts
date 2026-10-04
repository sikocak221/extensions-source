import { type Chapter, type FilterOption, type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { parseDate } from './zmanga/utils';
import { ZManga } from './zmanga/ZManga';

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

class OreManga extends ZManga {
  readonly name = 'OreManga';
  readonly baseUrl = 'https://www.oremanga.net';

  override searchPath = 'advance-search';
  override datePattern = 'd MMMM yyyy';

  override typeFilterValues: FilterOption[] = [
    { label: 'All', value: '' },
    { label: 'Manga', value: 'Manga' },
    { label: 'Manhua', value: 'Manhua' },
    { label: 'Manhwa', value: 'Manhwa' },
    { label: 'One-shot', value: 'One-shot' },
    { label: 'Doujinshi', value: 'Doujinshi' },
  ];

  override chapterFromElement(element: HtmlElement): Chapter {
    const date = THAI_MONTHS.reduce(
      (text, [thai, english]) => text.replace(thai, english),
      element.selectFirst('span.date')?.text() ?? '',
    );
    return { ...super.chapterFromElement(element), uploadedAt: parseDate(date, this.datePattern) };
  }

  override pageListParse(document: HtmlElement): Page[] {
    return document
      .select('.reader-area-main img, .reader-area-main canvas')
      .map((element, index) => ({
        index,
        imageUrl: element.absUrl('data-url') || element.absUrl('src'),
      }))
      .filter((page) => page.imageUrl);
  }
}

export default defineExtension({
  createSource: () => new OreManga().toSource(),
});
