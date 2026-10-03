import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate, relativeUrl } from './singleseries/utils';

class GrrlPower extends SingleSeries {
  readonly name = 'Grrl Power Comic';
  readonly baseUrl = 'https://www.grrlpowercomic.com';
  readonly series = {
    url: '/archive',
    title: 'Grrl Power',
    author: 'David Barrack',
    artist: 'David Barrack',
    description:
      "Grrl Power is a comic about a crazy nerdette that becomes a superheroine. Humor, action, cheesecake, beefcake, 'explosions, and maybe some drama. Possibly ninjas.",
    genres: ['superhero', 'humor', 'action'],
    status: 'ongoing' as const,
    thumbnailUrl: 'https://static.tvtropes.org/pmwiki/pub/images/rsz_grrl_power.png',
  };

  // One archive page per year since 2010; each date cell is followed by the strip's link.
  async getChapters(): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    for (let year = 2010; year <= new Date().getFullYear(); year++) {
      const body = (await this.fetchDocument(`/archive/?archive_year=${year}`)).html();
      for (const m of body.matchAll(
        /class="archive-date"[^>]*>([^<]*)<\/[^>]+>\s*<[^>]+>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
      )) {
        chapters.push({
          url: relativeUrl(m[2]!),
          name: m[3]!.replace(/<[^>]+>/g, '').trim(),
          uploadedAt: parseDate(`${m[1]!.trim()} ${year}`, 'MMM d yyyy'),
        });
      }
    }
    return chapters.sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
  }

  // Not ported: the author's notes rendered as a text page.
  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, 'div#comic img');
  }
}

export default defineExtension({
  createSource: () => new GrrlPower().toSource(),
});
