import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { Gattsu } from './gattsu/Gattsu';
import { parseDate, relativeUrl, selectIgnoreCase } from './gattsu/utils';

class UniversoHentai extends Gattsu {
  readonly name = 'Universo Hentai';
  readonly baseUrl = 'https://universohentai.com';

  override latestUpdatesSelector(): string {
    return `div.meio div.videos div.video a[href^="${this.baseUrl}"]:not(:has(span.selo-hd))`;
  }

  override latestUpdatesFromElement(element: HtmlElement): MangaSummary | null {
    const title = element.selectFirst('span.video-titulo')?.text();
    const href = element.attr('href');
    if (!title || !href) return null;
    return {
      url: relativeUrl(href),
      title,
      thumbnailUrl: element.selectFirst('img.wp-post-image')?.attr('src') || undefined,
    };
  }

  override mangaDetailsParse(document: HtmlElement): MangaDetails {
    const postBox = document.selectFirst(this.chapterListSelector()) ?? document;
    const text = (selector: string) => selectIgnoreCase(postBox, selector);
    return {
      url: '',
      title: postBox.selectFirst('h1.post-titulo')?.text() ?? '',
      author: text('ul.paginaPostItens li:contains(Artista) a')[0]?.text() || undefined,
      genres: text('ul.paginaPostItens li:contains(Categorias) a').map((a) => a.text()),
      status: 'completed',
      thumbnailUrl: this.withoutSize(postBox.selectFirst('div.paginaPostThumb > img.wp-post-image')?.attr('src')),
    };
  }

  override chapterListParse(document: HtmlElement, manga: MangaSummary): Chapter[] {
    return document
      .select(this.chapterListSelector())
      .map((element) => this.chapterFromElement(element, manga, document));
  }

  override chapterListSelector(): string {
    return 'div.meio div.post[itemscope]:has(a[title="Abrir galeria"])';
  }

  override chapterFromElement(element: HtmlElement, manga: MangaSummary, document: HtmlElement): Chapter {
    const published = document.selectFirst('meta[property="article:published_time"]')?.attr('content');
    const gallery = element.selectFirst('a[title="Abrir galeria"]')?.attr('href');
    return {
      url: gallery ? relativeUrl(gallery) : manga.url,
      name: 'Capítulo único',
      number: 1,
      scanlator: selectIgnoreCase(element, 'ul.paginaPostItens li:contains(Tradutor) a')[0]?.text() || undefined,
      uploadedAt: parseDate(published?.split('T')[0], 'yyyy-MM-dd'),
    };
  }

  override pageListSelector(): string {
    return 'div.meio div.galeria div.galeria-foto a img';
  }
}

export default defineExtension({
  createSource: () => new UniversoHentai().toSource(),
});
