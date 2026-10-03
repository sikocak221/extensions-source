import { type Chapter, type MangaDetails, type MangaSummary, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { ownText, parseDate } from './singleseries/utils';

const THUMB_URL = 'https://images2.imgbox.com/5d/d8/BVxRdljH_o.png';
const AUTHOR = 'Arad Kedar (Keydar)';
const SPECIALS_DATE = 1399926480000; // 2014-05-12 23:28
const SPECIALS = ['Looking For Group', 'Rover', 'Fan Comic'];

class DarkLegacyComics extends SingleSeries {
  readonly name = 'Dark Legacy Comics';
  readonly baseUrl = 'https://www.darklegacycomics.com';
  readonly series: MangaDetails = {
    url: '/archive',
    title: 'Dark Legacy Comics',
    thumbnailUrl: THUMB_URL,
    status: 'ongoing',
    author: AUTHOR,
    artist: AUTHOR,
  };

  override get catalogue(): MangaDetails[] {
    return [
      this.series,
      {
        url: '/specials/1.php',
        title: 'Dark Legacy Comics Specials',
        thumbnailUrl: THUMB_URL,
        status: 'completed',
        author: AUTHOR,
        artist: AUTHOR,
      },
    ];
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    if (manga.url !== '/archive') {
      return SPECIALS.map((name, i) => ({
        url: `/specials/${i + 1}`,
        name,
        number: i + 1,
        uploadedAt: SPECIALS_DATE,
      })).reverse();
    }
    const document = await this.fetchDocument('/archive');
    const seen = new Set<string>();
    const chapters: Chapter[] = [];
    for (const link of document.select('.archive_link')) {
      const index = link.selectFirst('.index')?.text() ?? '';
      if (!index || seen.has(index)) continue;
      seen.add(index);
      const date = ownText(link.selectFirst('.date'));
      chapters.push({
        url: `/${index}`,
        name: `#${index}: ${link.selectFirst('.name')?.text() ?? ''}`,
        number: Number(index),
        scanlator:
          link
            .select('.characters')
            .map((e) => e.text())
            .join(' ')
            .replace(/ /g, ', ') || undefined,
        uploadedAt:
          date === 'Sep 20' ? 1442696400000 : (parseDate(date, 'MMMM d, yyyy') ?? parseDate(date, 'MMM d, yyyy')),
      });
    }
    return chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '.comic > img');
  }
}

export default defineExtension({
  createSource: () => new DarkLegacyComics().toSource(),
});
