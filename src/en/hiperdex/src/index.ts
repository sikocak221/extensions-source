import { defineExtension } from '@matane/extension-sdk';
import { Hiper, MAX_RATING_PREFERENCE } from './hiper/Hiper';

const GENRES = [
  '4-Koma',
  'Action',
  'Adaptation',
  'Adult',
  'Adventure',
  'Age Gap',
  'Aliens',
  'Ancient Korea',
  'Anthology',
  'Campus',
  'Childhood Friends',
  'Comedy',
  'Cooking',
  'Crime',
  'Crossdressing',
  'Dance',
  'Delinquents',
  'Demons',
  'Doujinshi',
  'Drama',
  'Ecchi',
  'Escolar',
  'Fantasy',
  'Fellatio/Blowjob',
  'Fetish',
  'Full Color',
  'Furry',
  'Gender Bender',
  'Genderswap',
  'Ghosts',
  "Girls' Love",
  'Gore',
  'Guideverse',
  'Gyaru',
  'Hair Color Change',
  'Harem',
  'Hentai',
  'Heroes',
  'Historical',
  'Horror',
  'Human-Nonhuman Relationship',
  'Isekai',
  'Josei',
  'Korea',
  'Korean Ambience',
  'Korean BL',
  'Long Strip',
  'Long-Haired Male Character/s',
  'Long-Haired Male Lead',
  'Love Triangle/s',
  'Low Fantasy',
  'Maduro',
  'Mafia',
  'Magic',
  'Male Protagonist',
  'Manga',
  'Martial Arts',
  'Masculine Uke',
  'Mature',
  'Mecha',
  'Medical',
  'Military',
  'Monster Girls',
  'Monsters',
  'Monsters Invade Earth',
  'Murim',
  'Muscular Male Lead',
  'Muscular Uke',
  'Music',
  'Mystery',
  'Nameverse',
  'Ninja',
  'Office Workers',
  'Older Uke Younger Seme',
  'Oneshot',
  'Orphan Female Lead',
  'Police',
  'Post-Apocalyptic',
  'Psychological',
  'Red-Haired Male Lead',
  'Red-Haired Seme',
  'Regression',
  'Reincarnation',
  'Revenge',
  'Romance',
  'Samurai',
  'School Life',
  'Sci-fi',
  'Secret Relationship',
  'Seinen',
  'Sexual Violence',
  'Shota',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Size Difference',
  'Slice of Life',
  'Smut',
  'Sobrenatural',
  'Sports',
  'Superhero',
  'Supernatural',
  'Survival',
  'Suspense',
  'Thriller',
  'Time Travel',
  'Tower',
  'Tragedy',
  'Uncensored',
  'Video Games',
  'Villainess',
  'Violence',
  'Virtual Reality',
  'Web Comic',
  'Webtoon',
  'Wuxia',
  'Yaoi',
  'Yuri',
];

class Hiperdex extends Hiper {
  readonly name = 'Hiperdex';
  readonly baseUrl = 'https://hiperdex.tv';

  override extraHeaders = { 'x-cfg-auth': 'yceqt7qgu004' };
  override genresList = GENRES;

  override cleanTitle(title: string, browsing: boolean): string {
    return browsing && prefs.get<boolean>('NO_REMOVE_TITLE_BROWSING') ? title.trim() : cleanTitle(title);
  }
}

export default defineExtension({
  preferences: () => [
    MAX_RATING_PREFERENCE,
    {
      type: 'switch',
      key: 'REMOVE_TITLE_VERSION_en',
      label: 'Remove version information from entry titles',
      description: 'Removes tags like (Official) or (Uncensored), which helps spot duplicates.',
      default: false,
    },
    { type: 'text', key: 'REMOVE_TITLE_CUSTOM_en', label: 'Custom regex to be removed from titles', default: '' },
    {
      type: 'switch',
      key: 'NO_REMOVE_TITLE_BROWSING',
      label: "Don't clean titles while browsing or searching",
      default: false,
    },
  ],
  createSource: () => new Hiperdex().toSource(),
});

// Version tags like "(Official)" or "[Uncensored]" at either end of a title.
const TITLE_VERSION =
  /^(?:\s*(?:\([^()]*\)|\{[^{}]*\}|\[[^\]]*\]|«[^»]*»|〘[^〙]*〙|「[^」]*」|『[^』]*』|≪[^≫]*≫|﹛[^﹜]*﹜|〖[^〖〗]*〗|𖤍.+?𖤍|《[^》]*》|⌜.+?⌝|⟨[^⟩]*⟩)\s*)+|(?:\s*(?:\([^()]*\)|\{[^{}]*\}|\[[^\]]*\]|«[^»]*»|〘[^〙]*〙|「[^」]*」|『[^』]*』|≪[^≫]*≫|﹛[^﹜]*﹜|〖[^〖〗]*〗|𖤍.+?𖤍|《[^》]*》|⌜.+?⌝|⟨[^⟩]*⟩|\/\s*Official)\s*)+$/giu;

function cleanTitle(title: string): string {
  let value = title;
  const custom = prefs.get<string>('REMOVE_TITLE_CUSTOM_en');
  if (custom) {
    try {
      value = value.replace(new RegExp(custom, 'g'), '');
    } catch {
      // Invalid user regex: ignore it.
    }
  }
  if (prefs.get<boolean>('REMOVE_TITLE_VERSION_en')) value = value.replace(TITLE_VERSION, '');
  return value.trim();
}
