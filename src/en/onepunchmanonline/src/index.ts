import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { relativeUrl } from './singleseries/utils';

class OnePunchManOnline extends SingleSeries {
  readonly name = 'One Punch Man Online';
  // The site moved from 1punchman.com to this subdomain.
  readonly baseUrl = 'https://w20.1punchman.com';
  readonly series = {
    url: '/',
    title: 'One Punch Man',
    thumbnailUrl: 'https://1punchman.com/wp-content/uploads/2024/02/9782380712018_1_75.jpg',
    author: 'ONE',
    artist: 'Murata Yusuke',
    status: 'ongoing' as const,
    genres: ['Action', 'Comedy', 'Superhero', 'Seinen'],
    description:
      'One-Punch Man is a superhero who has trained so hard that his hair has fallen out, and who can overcome any enemy with one punch.',
  };

  async getChapters(): Promise<Chapter[]> {
    return (await this.fetchDocument('/'))
      .select("ul li a[href*='/manga/']")
      .map((a) => ({ url: relativeUrl(a.absUrl('href') || a.attr('href') || ''), name: a.text() }));
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(chapter.url);
    return document
      .select('div.entry-content img, .separator img, p img')
      .map((img) => img.absUrl('data-src') || img.absUrl('data-lazy-src') || img.absUrl('src') || '')
      .filter((u) => u.startsWith('http'))
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  // The image hosts refuse the site as Referer.
  override imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent };
  }
}

export default defineExtension({
  createSource: () => new OnePunchManOnline().toSource(),
});
