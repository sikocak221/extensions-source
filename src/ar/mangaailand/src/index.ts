import { type FilterOption, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class MangaAiLand extends ZeistManga {
  readonly name = 'Manga Ai Land';
  readonly baseUrl = 'https://manga-ai-land.blogspot.com';

  override hasFilters = true;
  override hasLanguageFilter = false;
  override chapterCategory = 'فصل';

  override getGenreList(): FilterOption[] {
    return [
      'تراجيدي', 'تاريخي', 'أكشن', 'خيالي', 'جيشي', 'تشويق', 'سينين', 'سحري', 'دراما', 'عصابات', 'عسكري', 'شونين',
      'مغامرة', 'فنون قتالية', 'غموض', 'وحوش', 'نجاة', 'نفسي',
    ].map((genre) => ({ label: genre, value: genre })); // prettier-ignore
  }
}

export default defineExtension({
  createSource: () => new MangaAiLand().toSource(),
});
