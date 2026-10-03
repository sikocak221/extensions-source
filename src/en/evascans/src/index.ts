import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class EvaScans extends MangaThemesia {
  readonly name = 'Eva Scans';
  readonly baseUrl = 'https://evascans.net';

  override mangaUrlDirectory = '/series';
  override seriesAltNameSelector = '.desktop-titles';

  // Locked chapters are kept, marked with a lock (their link is a post id).
  override chapterFromElement(element: HtmlElement): Chapter {
    const chapter = super.chapterFromElement(element);
    const a = element.selectFirst('a');
    const locked =
      a?.attr('data-bs-target') != null || a?.attr('data-coin') != null || element.selectFirst('.locked-badge') != null;
    if (!locked) return chapter;
    const id = a?.attr('data-id');
    return { ...chapter, name: `🔒 ${chapter.name}`, url: chapter.url || (id ? `/?p=${id}` : '') };
  }
}

export default defineExtension({
  createSource: () => new EvaScans().toSource(),
});
