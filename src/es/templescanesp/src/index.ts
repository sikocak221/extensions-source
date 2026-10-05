import { type Chapter, type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class TempleScan extends Madara {
  readonly name = 'Temple Scan';
  readonly baseUrl = 'https://aedexnox.akan01.com';

  override chapterDatePattern = 'MMMM d, yyyy';
  override mangaSubString = 'serie';
  override mangaDetailsSelectorTitle = 'div.wp-manga div.grid > h1';
  override mangaDetailsSelectorStatus = 'div.wp-manga div[alt=type]:eq(0) > span';
  override mangaDetailsSelectorGenre = 'div.wp-manga div[alt=type]:gt(0) > span';
  override mangaDetailsSelectorDescription = 'div.wp-manga div#expand_content';
  override archiveSelector(): string {
    return 'div.group';
  }
  override archiveUrlSelector = 'div.manga > div a';
  override archiveTitleSelector = 'h3';
  override chapterListSelector(): string {
    return 'ul#list-chapters li';
  }
  override chapterNameSelector = 'div.grid > span';
  override chapterDateSelector = 'div.grid > div';
  override chapterUrlSelector = 'a';
  // Some chapters answer with a form that has to be posted back (with the page as Referer) to get the images.
  override async getPages(chapter: Chapter): Promise<Page[]> {
    const url = this.absolute(chapter.url);
    const response = await http.get(url, { headers: this.headers() });
    let document = html.load(response.body, { baseUrl: response.url });
    const form = document.selectFirst('form#redirect-form[method=post]');
    if (form) {
      const fields: Record<string, string> = {};
      for (const input of form.select('input[name]')) fields[input.attr('name') ?? ''] = input.attr('value') ?? '';
      const posted = await http.post(
        form.absUrl('action') || form.attr('action') || url,
        { form: fields },
        { headers: { ...this.headers(), Referer: response.url } },
      );
      document = html.load(posted.body, { baseUrl: posted.url });
    }
    return this.parsePages(document);
  }

  // The site lists a placeholder chapter without a title ("n-a"): skipped.
  override chapterFromElement(element: HtmlElement, mangaPath: string): Chapter | null {
    const chapter = super.chapterFromElement(element, mangaPath);
    return chapter?.name.trim() ? chapter : null;
  }
}

export default defineExtension({
  createSource: () => new TempleScan().toSource(),
});
