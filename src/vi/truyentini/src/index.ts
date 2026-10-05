import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class TruyenTini extends Madara {
  readonly name = 'TruyenTini';
  readonly baseUrl = 'https://truyentini.net';

  override mangaSubString = 'truyen';
  override genreDirectory = 'the-loai';
  override altNameSelector = '.post-content_item:contains(Tên Khác) .summary-content';
  override chapterDatePattern = 'dd/MM/yyyy';
  override chapterMode = 'MangaAjax' as const;

  // Kotlin adds "đang dịch" to the ongoing statuses.
  override toStatus(text: string) {
    const status = super.toStatus(text);
    return status === 'unknown' && text.toLowerCase().includes('đang dịch') ? 'ongoing' : status;
  }

  override processThumbnail(url: string | null, fromSearch = false): string | null {
    const processed = super.processThumbnail(url, fromSearch);
    return processed ? processed.replace(/-\d+x\d+(\.[a-zA-Z]+)$/, '$1') : processed;
  }
}

export default defineExtension({
  createSource: () => new TruyenTini().toSource(),
});
