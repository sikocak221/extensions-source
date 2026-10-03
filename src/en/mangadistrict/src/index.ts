import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class MangaDistrict extends MadaraNoAjax {
  readonly name = 'Manga District';
  readonly baseUrl = 'https://mangadistrict.com';

  override mangaSubString = 'series';
  override genreDirectory = 'publication-genre';
  override nextPageSelector(): string {
    return '.wp-pagenavi a.last';
  }
  override chapterDateSelector = '.chapter-release-date .timediff';
  override pageListParseSelector = 'div.page-break img:not(noscript img):not(#image-99999)';

  override imageFromElement(element: HtmlElement | null | undefined): string | null {
    const original = element?.attr('data-wpfc-original-src')?.trim();
    if (original) return element!.absUrl('data-wpfc-original-src') || original;
    return super.imageFromElement(element);
  }

  // Chapters exist in two qualities; the preference keeps one of them.
  override async parseChapterList(document: HtmlElement, mangaPath: string): Promise<Chapter[]> {
    const chapters = await super.parseChapterList(document, mangaPath);
    const quality = prefs.get<string>('img_res') ?? 'all';
    if (quality === 'high') return chapters.filter((c) => !c.url.includes('/v2-full-quality'));
    if (quality === 'full') return chapters.filter((c) => !c.url.includes('/v1-high-quality'));
    return chapters;
  }

  override archiveManga(element: HtmlElement): MangaSummary | null {
    const manga = super.archiveManga(element);
    return manga && !prefs.get<boolean>('no_clean_browsing') ? { ...manga, title: cleanTitle(manga.title) } : manga;
  }

  override parseDetails(document: HtmlElement, path: string, manga: MangaSummary): MangaDetails {
    const details = super.parseDetails(document, path, manga);
    return { ...details, title: cleanTitle(details.title) };
  }
}

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: 'remove_title_version',
      label: 'Remove version information from entry titles',
      description: 'Removes tags like (Official) or (Doujinshi), which helps spot duplicates.',
      default: false,
    },
    { type: 'text', key: 'remove_title_custom', label: 'Custom regex to be removed from titles', default: '' },
    {
      type: 'switch',
      key: 'no_clean_browsing',
      label: "Don't clean titles while browsing or searching",
      default: false,
    },
    {
      type: 'select',
      key: 'img_res',
      label: 'Image quality',
      description: 'Refresh an entry to update its chapter list.',
      options: [
        { label: 'All', value: 'all' },
        { label: 'High quality', value: 'high' },
        { label: 'Full quality', value: 'full' },
      ],
      default: 'all',
    },
  ],
  createSource: () => new MangaDistrict().toSource(),
});

// Version tags like "(Official)" or "[Doujinshi]" at either end of a title.
const TITLE_VERSION =
  /^(?:\s*(?:\([^()]*\)|\{[^{}]*\}|\[[^\]]*\]|«[^»]*»|〘[^〙]*〙|「[^」]*」|『[^』]*』|≪[^≫]*≫|﹛[^﹜]*﹜|〖[^〖〗]*〗|𖤍.+?𖤍|《[^》]*》|⌜.+?⌝|⟨[^⟩]*⟩)\s*)+|(?:\s*(?:\([^()]*\)|\{[^{}]*\}|\[[^\]]*\]|«[^»]*»|〘[^〙]*〙|「[^」]*」|『[^』]*』|≪[^≫]*≫|﹛[^﹜]*﹜|〖[^〖〗]*〗|𖤍.+?𖤍|《[^》]*》|⌜.+?⌝|⟨[^⟩]*⟩|\/\s*Official)\s*)+$/giu;

function cleanTitle(title: string): string {
  let value = title;
  const custom = prefs.get<string>('remove_title_custom');
  if (custom) {
    try {
      value = value.replace(new RegExp(custom, 'g'), '');
    } catch {
      // Invalid user regex: ignore it.
    }
  }
  if (prefs.get<boolean>('remove_title_version')) value = value.replace(TITLE_VERSION, '');
  return value.trim();
}
