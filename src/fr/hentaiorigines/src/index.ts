import { type FilterOption, defineExtension } from '@matane/extension-sdk';
import { Origines } from './origines/Origines';

class HentaiOrigines extends Origines {
  readonly name = 'Hentai Origines';
  readonly baseUrl = 'https://hentai-origines.com';
  readonly mangaPath = 'manga';

  override origins: FilterOption[] = [
    { label: 'Doujinshi', value: 'doujinshi' },
    { label: 'Pornhwa', value: 'pornhwa' },
    { label: 'Pornhua', value: 'pornhua' },
    { label: 'Hentai', value: 'hentai' },
  ];

  readonly genres: FilterOption[] = [
    { label: 'Action', value: 'action' },
    { label: 'Alien', value: 'alien' },
    { label: 'Alpha', value: 'alpha' },
    { label: 'Amitié', value: 'amitie' },
    { label: 'Art martiaux', value: 'art-martiaux' },
    { label: 'Aventure', value: 'aventure' },
    { label: 'Belle-mère', value: 'belle-mere' },
    { label: "Boy's Love", value: 'yaoi' },
    { label: 'Campus', value: 'campus' },
    { label: 'Comédie', value: 'comedie' },
    { label: 'Domination', value: 'domination' },
    { label: 'Drame', value: 'drame' },
    { label: 'Démon', value: 'demon' },
    { label: 'Ecchi', value: 'ecchi' },
    { label: 'Fantasy', value: 'fantasy' },
    { label: 'Futanari', value: 'futanari' },
    { label: 'Furry', value: 'furry' },
    { label: 'Fétichisme', value: 'fetichisme' },
    { label: 'Gallerie', value: 'gallerie' },
    { label: 'Gangster', value: 'gangster' },
    { label: 'Gofast', value: 'gofast' },
    { label: 'Gore', value: 'gore' },
    { label: 'Guideverse', value: 'guideverse' },
    { label: 'Hardcore', value: 'hardcore' },
    { label: 'Harem', value: 'harem' },
    { label: 'Historique', value: 'historique' },
    { label: 'Horreur', value: 'horreur' },
    { label: 'Humiliation', value: 'humiliation' },
    { label: 'Inceste', value: 'inceste' },
    { label: 'Isekai', value: 'isekai' },
    { label: 'Josei', value: 'josei' },
    { label: 'Loli', value: 'loli' },
    { label: 'Love', value: 'love' },
    { label: 'Magie', value: 'magie' },
    { label: 'Mature', value: 'mature' },
    { label: 'Milf', value: 'milf' },
    { label: 'Mini-série', value: 'mini-serie' },
    { label: 'Monsters girls', value: 'monsters-girls' },
    { label: 'Ntr', value: 'ntr' },
    { label: 'Office', value: 'office' },
    { label: 'Omégaverse', value: 'omegaverse' },
    { label: 'Oneshot', value: 'oneshot' },
    { label: 'Parodie', value: 'parodie' },
    { label: 'Professeur', value: 'professeur' },
    { label: 'Psychologie', value: 'psychologie' },
    { label: 'Rape', value: 'rape' },
    { label: 'Romance', value: 'romance' },
    { label: 'Réincarnation', value: 'reincarnation' },
    { label: 'School life', value: 'school-life' },
    { label: 'Sci-fi', value: 'sci-fi' },
    { label: 'Shonen-ai', value: 'shonen-ai' },
    { label: 'Slice of life', value: 'slice-of-life' },
    { label: 'Smut', value: 'smut' },
    { label: 'Soft', value: 'soft' },
    { label: 'Sport', value: 'sport' },
    { label: 'Surnaturel', value: 'surnaturel' },
    { label: 'Tomgirl', value: 'tomgirl' },
    { label: 'Tragédie', value: 'tragedie' },
    { label: 'Triangle amoureux', value: 'triangle-amoureux' },
    { label: 'Uncensored', value: 'uncensored' },
    { label: 'Yuri', value: 'yuri' },
  ];
}

export default defineExtension({
  createSource: () => new HentaiOrigines().toSource(),
});
