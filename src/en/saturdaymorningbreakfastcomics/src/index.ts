import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate } from './singleseries/utils';

class SaturdayMorningBreakfastComics extends SingleSeries {
  readonly name = 'Saturday Morning Breakfast Comics';
  readonly baseUrl = 'https://smbc-comics.com';
  readonly series = {
    url: '/comic/archive',
    title: 'Saturday Morning Breakfast Comics',
    author: 'Zach Weinersmith',
    artist: 'Zach Weinersmith',
    status: 'ongoing' as const,
    description: 'SMBC is a daily comic strip about life, philosophy, science, mathematics, and dirty jokes.',
  };

  async getChapters(): Promise<Chapter[]> {
    // The archive answers HTTP 500 with the full page.
    const response = await http.request<string>({ url: `${this.baseUrl}${this.series.url}`, headers: this.headers() });
    if (response.status >= 400 && response.status !== 500) throw new Error(`HTTP ${response.status}`);
    const document = html.load(response.body);
    return document
      .select('option[value*="comic/"]')
      .map((option, index) => {
        const [date = '', title = ''] = option.text().split(' - ');
        return {
          url: `/${option.attr('value')}`,
          name: title || date,
          number: index + 1,
          uploadedAt: parseDate(date, 'MMMM d, yyyy'),
        };
      })
      .reverse();
  }

  // The strip and the "after comic" bonus panel (the original also renders the hover text as a page).
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(chapter.url);
    return [document.selectFirst('img#cc-comic'), document.selectFirst('#aftercomic > img')]
      .map((img) => img?.absUrl('src') || img?.attr('src') || '')
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }
}

export default defineExtension({
  createSource: () => new SaturdayMorningBreakfastComics().toSource(),
});
