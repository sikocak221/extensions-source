import { type MangaStatus, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Sushiscanfr extends MangaThemesia {
  readonly name = 'Sushiscan.fr';
  readonly baseUrl = 'https://sushiscan.fr';

  override mangaUrlDirectory = '/catalogue';
  override altNamePrefix = 'Nom alternatif : ';
  override seriesAuthorSelector = '.imptdt:contains(Auteur) i, .fmed b:contains(Auteur)+span';
  override seriesStatusSelector = '.imptdt:contains(Statut) i';

  override parseStatus(text: string | undefined | null): MangaStatus {
    const value = text?.toLowerCase() ?? '';
    if (value.includes('en cours')) return 'ongoing';
    if (value.includes('terminé')) return 'completed';
    return 'unknown';
  }
}

export default defineExtension({
  createSource: () => new Sushiscanfr().toSource(),
});
