import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Siikomik extends Madara {
  readonly name = 'Siikomik';
  readonly baseUrl = 'https://siikomik.id';

  override mangaSubString = 'komik';
  override chapterMode = 'MangaAjax' as const;

  override chapterFromElement(element: HtmlElement, mangaPath: string): Chapter | null {
    const chapter = super.chapterFromElement(element, mangaPath);
    if (chapter && /\bpremium(?:-block)?\b/.test(element.attr('class') ?? '')) chapter.name = `🔒 ${chapter.name}`;
    return chapter;
  }
}

export default defineExtension({
  createSource: () => new Siikomik().toSource(),
});
