import { defineExtension } from '@matane/extension-sdk';
import { MangaWork, type Option } from './mangawork/MangaWork';

const ORDER: Option[] = [
  ['A-Z', 'title'],
  ['Z-A', 'titlereverse'],
  ['Latest Update', 'update'],
  ['Latest Added', 'latest'],
  ['Popular', 'popular'],
];

const STATUS: Option[] = [
  ['All', ''],
  ['Publishing', 'Publishing'],
  ['Finished', 'Finished'],
];

const TYPE: Option[] = [
  ['All', ''],
  ['Manga', 'Manga'],
  ['Manhwa', 'Manhwa'],
  ['Manhua', 'Manhua'],
];

const GENRE: Option[] = [
  ['Ação', 'acao'],
  ['Action', 'action'],
  ['Adaptação', 'adaptacao'],
  ['Adaptation', 'adaptation'],
  ['Adulto', 'adulto'],
  ['Adventure', 'adventure'],
  ['Animals', 'animals'],
  ['Artes marciais', 'artes-marciais'],
  ['ave', 'ave'],
  ['Aventura', 'aventura'],
  ['Aventura Magia Fantasia Adaptação', 'aventura-magia-fantasia-adaptacao'],
  ['Award Winning', 'award-winning'],
  ['Boquete', 'boquete'],
  ['Comédia', 'comedia'],
  ['Comedy', 'comedy'],
  ['Cooking', 'cooking'],
  ['Crossdressing', 'crossdressing'],
  ['Delinquentes', 'delinquentes'],
  ['Delinquents', 'delinquents'],
  ['Demônios', 'demonios'],
  ['Demons', 'demons'],
  ['Drama', 'drama'],
  ['Ecchi', 'ecchi'],
  ['Erótica', 'erotica'],
  ['Erótico', 'erotico'],
  ['Esportes', 'esportes'],
  ['Fantasia', 'fantasia'],
  ['Fantasy', 'fantasy'],
  ['Full Color', 'full-color'],
  ['Garotas Monstro', 'garotas-monstro'],
  ['Genderswap', 'genderswap'],
  ['Gore', 'gore'],
  ['Gyaru', 'gyaru'],
  ['Harem', 'harem'],
  ['Incest', 'incest'],
  ['Incesto', 'incesto'],
  ['Isekai', 'isekai'],
  ['Loli', 'loli'],
  ['Long Strip', 'long-strip'],
  ['Magia', 'magia'],
  ['Magic', 'magic'],
  ['Manhwa', 'manhwa'],
  ['Martial Arts', 'martial-arts'],
  ['Masturbação', 'masturbacao'],
  ['Mature', 'mature'],
  ['Mecha', 'mecha'],
  ['Militares', 'militares'],
  ['Monster Girls', 'monster-girls'],
  ['Monsters', 'monsters'],
  ['Monstros', 'monstros'],
  ['Ninja', 'ninja'],
  ['Office Workers', 'office-workers'],
  ['Psychological', 'psychological'],
  ['Realidade Virtual', 'realidade-virtual'],
  ['Reencarnação', 'reencarnacao'],
  ['Reincarnation', 'reincarnation'],
  ['Romance', 'romance'],
  ['School Life', 'school-life'],
  ['Sci-Fi', 'sci-fi'],
  ['Seinen', 'seinen'],
  ['Sex Toys', 'sex-toys'],
  ['Sexual Violence', 'sexual-violence'],
  ['Shota', 'shota'],
  ['Slice of Life', 'slice-of-life'],
  ['Sobrenatural', 'sobrenatural'],
  ['Sobrevivência', 'sobrevivencia'],
  ['Sugestivo', 'sugestivo'],
  ['Supernatural', 'supernatural'],
  ['Survival', 'survival'],
  ['Thriller', 'thriller'],
  ['Time Travel', 'time-travel'],
  ['Vida escolar', 'vida-escolar'],
  ['Video Games', 'video-games'],
  ['Vilã', 'vila'],
  ['Villainess', 'villainess'],
  ['Violência', 'violencia'],
  ['Violência sexual', 'violencia-sexual'],
  ['Web Comic', 'web-comic'],
  ['Webcomic', 'webcomic'],
  ['Webtoon', 'webtoon'],
  ['Yuri', 'yuri'],
  ['Zombies', 'zombies'],
];

const YEAR: Option[] = [
  ['2008', '2008'],
  ['2011', '2011'],
  ['2014', '2014'],
  ['2015', '2015'],
  ['2017', '2017'],
  ['2018', '2018'],
  ['2019', '2019'],
  ['2020', '2020'],
  ['2021', '2021'],
  ['2022', '2022'],
  ['2023', '2023'],
  ['2024', '2024'],
  ['2025', '2025'],
  ['2026', '2026'],
];

const PT_MONTHS: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
};

class PizzariaScan extends MangaWork {
  readonly name = 'PizzariaScan';
  readonly baseUrl = 'https://pizzariacomics.com';

  override seriesPath = 'todas-as-obras';

  override parseChapterDate(date: string | undefined): number | undefined {
    const parts = date
      ?.normalize('NFD')
      .replace(/\p{Mn}+/gu, '')
      .toLowerCase()
      .split(' de ');
    if (!parts || parts.length !== 3) return 0;
    const [day, month, year] = parts;
    const monthNumber = PT_MONTHS[month!.trim()];
    if (Number.isNaN(Number.parseInt(day!, 10)) || !monthNumber || Number.isNaN(Number.parseInt(year!, 10))) return 0;
    return super.parseChapterDate(`${Number.parseInt(day!, 10)}/${monthNumber}/${Number.parseInt(year!, 10)}`);
  }

  override getOrderFilterOptions(): Option[] {
    return ORDER;
  }

  override getStatusFilterOptions(): Option[] {
    return STATUS;
  }

  override getTypeFilterOptions(): Option[] {
    return TYPE;
  }

  override getGenreFilterOptions(): Option[] {
    return GENRE;
  }

  override getYearFilterOptions(): Option[] {
    return YEAR;
  }
}

export default defineExtension({
  createSource: () => new PizzariaScan().toSource(),
});
