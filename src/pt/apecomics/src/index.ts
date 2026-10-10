import { defineExtension } from '@matane/extension-sdk';
import { MangaWork, type Option } from './mangawork/MangaWork';

const ORDER: Option[] = [
  ["A-Z", "title"],
  ["Z-A", "titlereverse"],
  ["Latest Update", "update"],
  ["Latest Added", "latest"],
  ["Popular", "popular"],
];

const STATUS: Option[] = [
  ["All", ""],
  ["Publishing", "Publishing"],
  ["Finished", "Finished"],
];

const TYPE: Option[] = [
  ["All", ""],
  ["Manga", "Manga"],
  ["Manhwa", "Manhwa"],
  ["Manhua", "Manhua"],
];

const GENRE: Option[] = [
  ["Ação", "acao"],
  ["Artes Marciais", "artes-marciais"],
  ["Cultivo", "cultivo"],
  ["Ecchi", "ecchi"],
  ["Fantasia", "fantasia"],
  ["Harem", "harem"],
  ["Jianghu", "jianghu"],
];

const YEAR: Option[] = [
  ["2026", "2026"],
];


class Capitoons extends MangaWork {
  readonly name = "Capitoons";
  readonly baseUrl = "https://capitoons.com";

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
  createSource: () => new Capitoons().toSource(),
});
