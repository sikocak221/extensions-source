import { type Preference, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

const REMOVE_PREMIUM_PREFERENCE: Preference = {
  type: 'switch',
  key: 'removePremiumChapters',
  label: 'Filtrar capítulos de pago',
  description:
    'Oculta automáticamente los capítulos que requieren Taels. Para aplicar los cambios, actualiza la lista de capítulos.',
  default: true,
};

class MHScans extends Madara {
  readonly name = 'MHScans';
  readonly baseUrl = 'https://mhscans.com';

  override chapterDatePattern = "dd 'de' MMMM 'de' yyyy";
  override mangaSubString = 'series';
  override chapterMode = 'MangaAjax' as const;

  override chapterListSelector(): string {
    const base = super.chapterListSelector();
    return (prefs.get<boolean>(REMOVE_PREMIUM_PREFERENCE.key) ?? true) ? `${base}:not(.premium)` : base;
  }
}

export default defineExtension({
  preferences: () => [REMOVE_PREMIUM_PREFERENCE],
  createSource: () => new MHScans().toSource(),
});
