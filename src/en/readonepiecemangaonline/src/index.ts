import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadOnePieceMangaOnline extends MangaCatalog {
  readonly name = 'Read One Piece Manga Online';
  readonly sourceList: [string, string][] = [
    ['One Piece', '/manga/one-piece/'],
    ['Colored', '/manga/one-piece-digital-colored-comics/'],
    ['Soma x Sanji', '/manga/shokugeki-no-sanji-one-shot/'],
    ['OP x Toriko', '/manga/one-piece-x-toriko/'],
    ['Party', '/manga/one-piece-party/'],
    ['DB x OP', '/manga/dragon-ball-x-one-piece/'],
    ['Wanted!', '/manga/wanted-one-piece/'],
    ["Ace's Story", '/manga/one-piece-ace-s-story/'],
    ['Omake', '/manga/one-piece-omake/'],
    ['Vivre Card', '/manga/vivre-card-databook/'],
    ['Pirate Recipes', '/manga/one-piece-pirate-recipes/'],
    ['Databook', '/manga/one-piece-databook/'],
    ["Ace's Story Manga", '/manga/one-piece-ace-story-manga/'],
    ['OP Academy', '/manga/one-piece-academy/'],
    ['MONSTERS', '/manga/monsters/'],
    ['Zoro Novel', '/manga/one-piece-novel-zoro/'],
    ['OP in Love', '/manga/one-piece-in-love/'],
    ['Heroines', '/manga/one-piece-novel-heroines/'],
  ];
  readonly baseUrl = 'https://ww13.readonepiece.com';
}

export default defineExtension({
  createSource: () => new ReadOnePieceMangaOnline().toSource(),
});
