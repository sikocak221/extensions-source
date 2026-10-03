import { type FilterState, type HtmlElement, type MangaPage, type Page, defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';
import { withQuery } from './keyoapp/utils';

class ArtLapsa extends Keyoapp {
  readonly name = 'Art Lapsa';
  readonly baseUrl = 'https://artlapsa.com';

  override searchMangaSelector(): string {
    return "main#main-content [wire\\:key*='serie']";
  }
  override altNameSelector = 'div.font-medium:contains(Alternative titles) ~ div span.select-all';
  override statusSelector = '[alt=Status]';
  override typeSelector = '[alt=Type]';
  override paidChapterSelector = 'img[alt~=Coin], img[src*=star-circle]';

  // Server-side search on /search (Livewire), 20 per page.
  override async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const genre = Object.entries(filters)
      .find(([id, value]) => id.startsWith('genre.') && value === true)?.[0]
      .slice(6);
    const url = withQuery(`${this.baseUrl}/search`, {
      page: page > 1 ? String(page) : undefined,
      title: query.trim() || undefined,
      genre,
    });
    const document = await this.fetchDocument(url);
    const items = document
      .select(this.searchMangaSelector())
      .map((element) => this.popularMangaFromElement(element))
      .filter((manga) => manga.url && manga.title);
    return { items, hasNextPage: items.length >= 20 };
  }

  override async fetchGenres(): Promise<[string, string][]> {
    const document = await this.fetchDocument(`${this.baseUrl}/search`);
    return document
      .select('[wire\\:model\\.live=genre] option')
      .filter((o) => !o.text().includes('All'))
      .map((o): [string, string] => [o.text(), o.attr('value') ?? ''])
      .filter(([, v]) => v);
  }

  // Pages are a JSON list inside the reader's Alpine x-data.
  override pageListParse(document: HtmlElement, body: string): Page[] {
    const xData = document.selectFirst('[x-data*=immersiveReader]')?.attr('x-data');
    if (!xData) return super.pageListParse(document, body);
    if (/canRead\s*:\s*false/.test(xData))
      throw new Error('This chapter is locked: log in on the website and unlock it to read.');
    const baseLink = /baseLink\s*:\s*['"]([^'"]+)['"]/.exec(xData)?.[1] ?? `${this.baseUrl}/storage/`;
    let json = xData.includes("JSON.parse('") ? xData.split("JSON.parse('")[1]!.split("')")[0]! : '';
    if (json) json = JSON.parse(`"${json}"`) as string;
    else {
      const start = xData.indexOf('pages:');
      const rest = start >= 0 ? xData.slice(start + 6).trimStart() : '';
      let depth = 0;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '[') depth++;
        else if (rest[i] === ']' && --depth === 0) {
          json = rest.slice(0, i + 1);
          break;
        }
      }
    }
    const pages = json ? (JSON.parse(json) as { path: string }[]) : [];
    if (pages.length === 0) throw new Error('This chapter is locked: log in on the website and unlock it to read.');
    return pages.map((page, index) => ({
      index,
      imageUrl: /^https?:\/\//.test(page.path)
        ? page.path
        : `${baseLink.replace(/\/+$/, '')}/${page.path.replace(/^\/+/, '')}`,
    }));
  }
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new ArtLapsa().toSource(),
});
