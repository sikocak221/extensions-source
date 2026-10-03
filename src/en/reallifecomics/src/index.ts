import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate } from './singleseries/utils';

const SUMMARY = 'The normal daily lives of some abnormal people. This entry includes all the chapters published in';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// One entry per year of the archive (2016-2017 have none).
class RealLifeComics extends SingleSeries {
  readonly name = 'Real Life Comics';
  readonly baseUrl = 'https://reallifecomics.com';
  readonly series = this.year(new Date().getFullYear());

  year(year: number): MangaDetails {
    return {
      url: `/archivepage.php?year=${year}`,
      title: `Real Life Comics (${year})`,
      thumbnailUrl: `${this.baseUrl}/images/logo.png`,
      author: 'Maelyn Dean',
      status: year === new Date().getFullYear() ? 'ongoing' : 'completed',
      description: `${SUMMARY} ${year}`,
    };
  }

  override get catalogue(): MangaDetails[] {
    const current = new Date().getFullYear();
    return Array.from({ length: current - 1998 }, (_, i) => current - i)
      .filter((y) => y < 2016 || y > 2017)
      .map((y) => this.year(y));
  }

  // The current year is left out until it has a strip.
  override async getPopular(): Promise<MangaPage> {
    const [current, ...older] = this.catalogue;
    const hasStrips = (await this.fetchDocument(current!.url)).selectFirst('.calendar td a') != null;
    return { items: (hasStrips ? [current!, ...older] : older).map((s) => this.summary(s)), hasNextPage: false };
  }

  // Each month is an <h4 class="month"> followed by a calendar of day links.
  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(manga.url);
    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    const body = document.html();
    let month = '';
    for (const match of body.matchAll(
      /<h4[^>]*class="month"[^>]*>([\s\S]*?)<\/h4>|<a[^>]*href="([^"]+)"[^>]*>(\d+)<\/a>/g,
    )) {
      if (match[1]) month = match[1].replace(/<[^>]+>/g, '').trim();
      else if (match[2] && !seen.has(match[2])) {
        seen.add(match[2]);
        const time = parseDate(`${month} ${match[3]}`, 'MMMM yyyy d');
        const d = time === undefined ? null : new Date(time);
        chapters.push({
          url: match[2].startsWith('/') ? match[2] : `/${match[2]}`,
          name: d
            ? `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`
            : `${month} ${match[3]}`,
          number: chapters.length,
          uploadedAt: time,
        });
      }
    }
    return chapters;
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '.comic img');
  }
}

export default defineExtension({
  createSource: () => new RealLifeComics().toSource(),
});
