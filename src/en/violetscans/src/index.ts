import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class VioletScans extends MangaThemesia {
  readonly name = 'Violet Scans';
  readonly baseUrl = 'https://violetmanga.com';

  override mangaUrlDirectory = '/comics';
  override searchMangaSelector(): string {
    return '.utao .uta .imgu, .listupd .bs .bsx:not(:has(.novelabel)), .listo .bs .bsx:not(:has(.novelabel))';
  }
  override chapterListSelector(): string {
    return '#chapterlist li:not(:has(svg))';
  }
  override seriesAltNameSelector = '.alternative .desktop-titles';
}

export default defineExtension({
  createSource: () => new VioletScans().toSource(),
});
