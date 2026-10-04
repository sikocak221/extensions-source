import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class Yokai extends ZeistManga {
  readonly name = 'Yokai';
  readonly baseUrl = 'https://yokai-team.blogspot.com';

  override preferChapterUpdatedDate = true;

  override async getChapterList(feedUrl: string, document?: HtmlElement): Promise<Chapter[]> {
    const fromFeed = (await super.getChapterList(feedUrl)).map((chapter): Chapter => {
      let numberText: string | undefined;
      let name = chapter.name;
      if (/^chapter/i.test(name)) {
        numberText = name.slice('chapter'.length).trim().split(' ')[0];
        name = `الفصل ${numberText}`;
      } else numberText = /الفصل\s*(\d+(?:\.\d+)?)/.exec(name)?.[1];
      const number = Number(numberText);
      return { ...chapter, name, number: numberText && !Number.isNaN(number) ? number : chapter.number };
    });
    const downloads = (document?.select('div#download > div.index-list > a') ?? []).map((element): Chapter => {
      const text = element.text().trim();
      return {
        url: this.toRelative(element.absUrl('href') || element.attr('href') || ''),
        name: text,
        number: Number(text.split(' ')[0]) || 1,
      };
    });
    const seen = new Set<string>();
    return [...fromFeed, ...downloads].filter((chapter) => {
      const key = chapter.url.split('?')[0]!;
      return !seen.has(key) && !!seen.add(key);
    });
  }
}

export default defineExtension({
  createSource: () => new Yokai().toSource(),
});
