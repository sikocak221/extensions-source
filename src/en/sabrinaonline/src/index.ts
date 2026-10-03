import { type Chapter, type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { relativeUrl } from './singleseries/utils';

class SabrinaOnline extends SingleSeries {
  readonly name = 'Sabrina Online';
  readonly baseUrl = 'https://www.sabrina-online.com';
  readonly series = {
    url: '/archive.html',
    title: 'Sabrina Online',
    thumbnailUrl: 'https://dummyimage.com/768x994/000/ffffff.jpg&text=Sabrina Online',
    author: 'Eric W. Schwartz',
    artist: 'Eric W. Schwartz',
    status: 'unknown' as const,
  };

  // The archive is a table: a row of section headers (years) above a row of links.
  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    const chapters: Chapter[] = [];
    const rowChapters = (tr: HtmlElement, sections: string[]) =>
      tr.select('td').forEach((td, index) => {
        for (const a of td.select('a')) {
          const name = a.text();
          if (!name) continue;
          const section = sections[index] ?? '';
          chapters.push({
            url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
            name: /^\d/.test(section) ? `${section} ${name}` : name,
          });
        }
      });
    const rows = document.select('center table tr');
    for (let i = 0; i < rows.length; i += 2) {
      const [first, second] = [rows[i]!, rows[i + 1]];
      if (!second) rowChapters(first, []);
      else {
        const sections = first.select('td').map((td) => td.text().trim());
        if (sections.length > 0) rowChapters(second, sections);
        else {
          rowChapters(second, []);
          rowChapters(first, []);
        }
      }
    }
    return chapters.reverse();
  }

  // Strips link to their full-size image when they are wrapped in <a>.
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(chapter.url);
    const pages: string[] = [];
    for (const a of document.select('center a:has(> img)')) {
      const src = a.selectFirst('img')?.attr('src') ?? '';
      if (src.includes('strips/') || src.includes('pages/')) pages.push(a.absUrl('href') || a.attr('href') || '');
    }
    if (pages.length === 0) {
      for (const img of document.select('center img')) {
        const src = img.attr('src') ?? '';
        if (src.includes('strips/') || src.includes('pages/')) pages.push(img.absUrl('src') || src);
      }
    }
    return pages.filter(Boolean).map((imageUrl, index) => ({ index, imageUrl }));
  }
}

export default defineExtension({
  createSource: () => new SabrinaOnline().toSource(),
});
