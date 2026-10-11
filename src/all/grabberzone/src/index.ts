import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class GrabberZone extends Madara {
  readonly name = 'Grabber Zone';
  readonly baseUrl = 'https://grabber.zone';

  override chapterDatePattern = 'dd.MM.yyyy';
  override mangaSubString = 'comics';

  override chapterFromElement(element: HtmlElement, mangaPath: string): Chapter | null {
    const chapter = super.chapterFromElement(element, mangaPath);
    if (chapter) chapter.name = element.selectFirst('a + a')?.text() ?? chapter.name;
    return chapter;
  }
}

export default defineExtension({
  createSource: () => new GrabberZone().toSource(),
});
