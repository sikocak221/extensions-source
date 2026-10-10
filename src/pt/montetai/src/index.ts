import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';
import { mangaIdOf, pathOf } from './madara/MadaraBase';

class MonteTai extends Madara {
  readonly name = "Monte Tai";
  readonly baseUrl = "https://montetaiscanlator.xyz";

  override chapterDatePattern = 'dd/MM/yyyy';
  override pageSize = 16;
  override mangaDetailsSelectorThumbnail = '.mtx-cover img';
  override mangaDetailsSelectorAuthor = '.mtx-side-item:contains(Autor) .mtx-side-value';
  override mangaDetailsSelectorArtist = '.mtx-side-item:contains(Artista) .mtx-side-value';
  override mangaDetailsSelectorGenre = '.mtx-chip-list a';
  override mangaDetailsSelectorDescription = '.mtx-synopsis';
  override mangaDetailsSelectorStatus = '.mtx-pill-status';

  override async fetchChapters(_mangaPath: string, mangaPage: HtmlElement | null): Promise<Chapter[]> {
    const script = mangaPage?.selectFirst('#mt-header-js-js-extra')?.html() ?? '';
    const nonce = /(?:nonce"[^"]+")([^"]+)/.exec(script)?.[1];
    const id = mangaPage ? mangaIdOf(mangaPage) : null;
    if (!nonce || !id) throw new Error('Missing chapter nonce');
    const response = await http.post(
      `${this.baseUrl}/wp-admin/admin-ajax.php`,
      { form: { action: 'mt_get_summary_chapters', nonce, manga_id: id } },
      { headers: this.xhrHeaders() },
    );
    const json = JSON.parse(response.body) as { data: { rows: { url: string; title: string; meta?: string }[] } };
    return json.data.rows.map((row) => ({
      url: pathOf(row.url),
      name: row.title,
      uploadedAt: this.parseChapterDate(row.meta),
    }));
  }
}

export default defineExtension({
  createSource: () => new MonteTai().toSource(),
});
