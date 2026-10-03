import { type Chapter, type MangaDetails, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';

class TheGirlFromRandomChattingMangaOnline extends SingleSeries {
  readonly name = 'The Girl from Random Chatting Manga Online';
  readonly baseUrl = 'https://thegirlfromrandomchatting.com';
  readonly series: MangaDetails = {
    url: '/',
    title: 'The Girl from Random Chatting',
    author: 'Eun Hyuk, Park',
    artist: 'Eun Hyuk, Park',
    status: 'completed',
    description:
      'If you lived through – or are still living through – high school, you can relate to Joon-Woo. An outcast and a loner, his only joy ' +
      'comes from the hours he spends on his phone, randomly chatting with strangers. It’s all weird and meaningless, until Joon-Woo strikes ' +
      'gold – as he’s matched in a private chat with a pretty young girl his age. Jackpot! But when he discovers that this same pretty girl is ' +
      'actually his classmate Seung Ah, things get a little too real for a guy who’s never even remotely been kissed.\n(sourced from Webtoon)',
    genres: ['Action', 'Drama', 'Comedy', 'Romance', 'Slice of Life', 'Shounen', 'Harem'],
  };

  override async getMangaDetails(): Promise<MangaDetails> {
    const document = await this.fetchDocument('/');
    const thumb = document
      .selectFirst('figure.wp-block-gallery figure.wp-block-image:last-child noscript img')
      ?.attr('src');
    return { ...this.series, thumbnailUrl: thumb };
  }

  async getChapters(): Promise<Chapter[]> {
    const data = (
      await http.get<{ title: string; date: string; url: string }[]>(`${this.baseUrl}/wp-json/mg/v1/chapters-list`, {
        headers: this.headers(),
        responseType: 'json',
      })
    ).body;
    return data.map((c) => {
      const slug =
        c.url
          .replace(/[?#].*$/, '')
          .split('/')
          .filter(Boolean)
          .pop() ?? '';
      const name = c.title.split(', ')[1] ?? c.title;
      const time = Date.parse(c.date);
      return {
        url: `/manga/${slug}`,
        name,
        number: Number(name.split(' ')[1]) || undefined,
        uploadedAt: Number.isFinite(time) ? time : undefined,
      };
    });
  }

  // Lazy-loaded images keep the real url in data-lazy-src.
  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, 'img[data-lazy-src]', ['data-lazy-src']);
  }
}

export default defineExtension({
  createSource: () => new TheGirlFromRandomChattingMangaOnline().toSource(),
});
