import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';

class GunnerkriggCourt extends SingleSeries {
  readonly name = 'Gunnerkrigg Court';
  readonly baseUrl = 'https://www.gunnerkrigg.com';
  readonly series = {
    url: '/archives/',
    title: 'Gunnerkrigg Court',
    author: 'Tom Siddell',
    artist: 'Tom Siddell',
    status: 'ongoing' as const,
    description:
      'Gunnerkrigg Court is a Science Fantasy webcomic by Tom Siddell about a strange young girl attending an equally strange school. ' +
      'The intricate story is deeply rooted in world mythology, but has a strong focus on science (chemistry and robotics, most prominently) as well.\n' +
      'Antimony Carver begins classes at the eponymous U.K. Boarding School, and soon notices that strange events are happening: a shadow creature ' +
      'follows her around; a robot calls her "Mummy"; a Rogat Orjak smashes in the dormitory roof; odd birds, ticking like clockwork, stand guard ' +
      'in out-of-the-way places.\nStranger still, in the middle of all this, Annie remains calm and polite to a fault.',
    thumbnailUrl: 'https://i.imgur.com/g2ukAIKh.jpg',
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    // Each chapter button is followed by a <select> of its pages; every page is one "chapter" here.
    const chapters: Chapter[] = [];
    const html = document.selectFirst('div.chapters')?.html() ?? '';
    let title = 'Chapter';
    for (const match of html.matchAll(/<(a)\b[^>]*>([\s\S]*?)<\/a>|<option[^>]*value=['"](\d+)['"]/gi)) {
      if (match[3]) {
        const n = Number(match[3]);
        chapters.push({ url: `/?p=${match[3]}`, name: `${title} (${n})`, number: n });
      } else if (match[2]) {
        title = match[2].replace(/<[^>]+>/g, '').trim() || title;
      }
    }
    return chapters.reverse();
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '.comic_image');
  }
}

export default defineExtension({
  createSource: () => new GunnerkriggCourt().toSource(),
});
