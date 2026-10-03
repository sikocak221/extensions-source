import { type Chapter, type MangaDetails, type MangaSummary, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate } from './singleseries/utils';

const THUMB =
  'https://static.tumblr.com/8cee5e83d26a8a96ad5e51b67f2e340e/j8ipbno/fXFoj0zh9/tumblr_static_1f2fhwjyya74gsgs888g8k880.png';
const ABOUT =
  'El Goonish Shive is a comic about a group of teenagers who face both real life and bizarre, supernatural situations. \n\n' +
  'It is a comedy mixed with drama and is recommended for audiences thirteen and older.';
const entry = (url: string, title: string, extra = ''): MangaDetails => ({
  url,
  title,
  author: 'Dan Shive',
  artist: 'Dan Shive',
  status: 'ongoing',
  description: ABOUT + extra,
  thumbnailUrl: THUMB,
});

class ElGoonishShive extends SingleSeries {
  readonly name = 'El Goonish Shive';
  readonly baseUrl = 'https://www.egscomics.com';
  readonly series = entry('/comic/archive', 'El Goonish Shive');

  override get catalogue(): MangaDetails[] {
    return [
      this.series,
      entry(
        '/egsnp/archive',
        'El Goonish Shive: NewsPaper',
        " \n\nEGS:NP is a subsection with short stories that generally aren't canon unless stated",
      ),
      entry(
        '/sketchbook/archive',
        'El Goonish Shive Sketchbook',
        " \n\nThe Sketchbook section is full of one-shot gags, sketches, comics that don't fit elsewhere.",
      ),
    ];
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(manga.url);
    return document
      .select('select[name=comic] option')
      .filter((o) => /^(comic|egsnp|sketchbook)/.test(o.attr('value') ?? ''))
      .map((option, index) => {
        const [date = '', title = ''] = option.text().split(/ - (.*)/s);
        return {
          url: `/${option.attr('value')}`,
          name: title || date,
          number: index,
          uploadedAt: parseDate(date, 'MMMM d, yyyy'),
        };
      })
      .reverse();
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '#cc-comic');
  }
}

export default defineExtension({
  createSource: () => new ElGoonishShive().toSource(),
});
