import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ManhwaClubnet extends Madara {
  constructor(readonly lang: string) {
    super();
  }

  readonly name = 'ManhwaClub.net';
  readonly baseUrl = 'https://manhwaclub.net';

  override chapterMode = 'AdminAjax' as const;

  override async fetchChapters(mangaPath: string, mangaPage: HtmlElement | null): Promise<Chapter[]> {
    const chapters = await super.fetchChapters(mangaPath, mangaPage);
    if (this.lang === 'en') return chapters.filter((c) => !c.name.endsWith(' raw'));
    if (this.lang === 'ko') return chapters.filter((c) => c.name.endsWith(' raw'));
    return [];
  }
}

export default defineExtension({
  createSource: ({ lang }) => new ManhwaClubnet(lang).toSource(),
});
