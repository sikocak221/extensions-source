import type { Chapter, MangaPage, MangaSummary, Source } from '@matane/extension-sdk';
import { defineExtension } from '@matane/extension-sdk';
import { FoolSlide } from './foolslide/FoolSlide';
import { relativeUrl } from './foolslide/utils';

class JuinJutsuTeamReader extends FoolSlide {
  readonly name = 'Juin Jutsu Team Reader';
  readonly baseUrl = 'https://www.juinjutsureader.ovh';

  private seenMangaUrls = new Set<string>();

  override async getPopular(page: number): Promise<MangaPage> {
    if (page === 1) this.seenMangaUrls.clear();
    const document = await this.fetchDocument(`${this.baseUrl}/latest/${page}/`);
    const items = this.parseList(document, null, false).items.filter((m) => {
      if (this.seenMangaUrls.has(m.url)) return false;
      this.seenMangaUrls.add(m.url);
      return true;
    });
    return { items, hasNextPage: items.length > 0 && document.selectFirst('div.next a') != null };
  }

  // The site's search results are `div.series_element`, not the theme's `div.group`.
  override async search(query: string): Promise<MangaPage> {
    const response = await http.post(
      `${this.baseUrl}/search/`,
      { form: { search: query.trim() } },
      { headers: this.headers() },
    );
    const document = html.load(response.body, { baseUrl: response.url });
    const items = document.select('div.series_element').flatMap((element): MangaSummary[] => {
      const link = element.selectFirst('div.title a');
      if (!link) return [];
      return [
        {
          url: relativeUrl(link.attr('href') ?? ''),
          title: link.text(),
          thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
        },
      ];
    });
    return { items, hasNextPage: false };
  }

  override chapterListSelector(): string {
    return 'div.group_comic div.element';
  }

  override async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    return (await super.getChapters(manga))
      .filter((chapter) => !/^\d+$/.test(chapter.name.trim()))
      .map((chapter) => {
        const number = /\/(\d+(?:\.\d+)?)\/(?:\d+\/)?$/.exec(chapter.url)?.[1];
        return number ? { ...chapter, number: Number.parseFloat(number) } : chapter;
      });
  }

  override toSource(): Source {
    const { getLatest: _latest, ...source } = super.toSource();
    return source;
  }
}

export default defineExtension({
  createSource: () => new JuinJutsuTeamReader().toSource(),
});
