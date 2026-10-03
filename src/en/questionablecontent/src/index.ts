import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';

class QuestionableContent extends SingleSeries {
  readonly name = 'Questionable Content';
  readonly baseUrl = 'https://www.questionablecontent.net';
  readonly series = {
    url: '/archive.php',
    title: 'Questionable Content',
    author: 'Jeph Jacques',
    artist: 'Jeph Jacques',
    status: 'ongoing' as const,
    description: 'An internet comic strip about romance and robots',
    thumbnailUrl: 'https://i.ibb.co/ZVL9ncS/qc-teh.png',
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    const seen = new Set<string>();
    const chapters: Chapter[] = [];
    for (const a of document.select('div#container a[href^="view.php?comic="]')) {
      const href = a.attr('href') ?? '';
      if (seen.has(href)) continue;
      seen.add(href);
      const text = a.text();
      const match = /^See #(\d+): "(.*)" with newspost$/.exec(text);
      chapters.push({
        url: `/${href}`,
        name: match ? `${match[1]}: ${match[2]}` : text,
        number: Number(href.split('=')[1]) || undefined,
      });
    }
    // The site shows no dates: the newest strip gets the time it was first seen.
    const first = chapters[0];
    if (first) {
      const last = await storage.get<{ url: string; date: number }>('last_chapter');
      const date = last?.url === first.url ? last.date : Date.now();
      if (last?.url !== first.url) await storage.set('last_chapter', { url: first.url, date });
      first.uploadedAt = date;
    }
    return chapters;
  }

  // Not ported: the author's notes rendered as an extra text page.
  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '#strip');
  }
}

export default defineExtension({
  createSource: () => new QuestionableContent().toSource(),
});
