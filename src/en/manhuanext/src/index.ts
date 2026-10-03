import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Manhuanext extends Madara {
  readonly name = 'Manhuanext';
  readonly baseUrl = 'https://manhuanext.com';

  override chapterMode = 'MangaAjax' as const;

  override chapterListSelector(): string {
    return prefs.get<boolean>('hide_premium_chapters') === false
      ? 'li.wp-manga-chapter'
      : 'li.wp-manga-chapter:not(.premium-block)';
  }
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: 'hide_premium_chapters', label: 'Hide premium chapters', default: true }],
  createSource: () => new Manhuanext().toSource(),
});
