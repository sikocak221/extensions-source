import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { relativeUrl } from './singleseries/utils';

class ExistentialComics extends SingleSeries {
  readonly name = 'Existential Comics';
  readonly baseUrl = 'https://existentialcomics.com';
  readonly series = {
    url: '/archive/byDate',
    title: 'Existential Comics',
    author: 'Corey Mohler',
    artist: 'Corey Mohler',
    status: 'ongoing' as const,
    description:
      'A philosophy comic about the inevitable anguish of living a brief life in an absurd world. Also Jokes.',
    thumbnailUrl: 'https://i.ibb.co/pykMVYM/existential-comics.png',
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    const seen = new Set<string>();
    const chapters: Chapter[] = [];
    for (const li of document.select('div#date-comics ul li')) {
      const a = li.selectFirst('a');
      const url = relativeUrl(a?.attr('href') ?? '');
      if (!a || !url || seen.has(url)) continue;
      seen.add(url);
      chapters.push({ url, name: a.text(), number: Number(url.split('/').pop()) || undefined });
    }
    return chapters.reverse();
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '.comicImg');
  }
}

export default defineExtension({
  createSource: () => new ExistentialComics().toSource(),
});
