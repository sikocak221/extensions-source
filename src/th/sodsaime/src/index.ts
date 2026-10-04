import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Sodsaime extends MangaThemesia {
  readonly name = 'Sodsaime';
  readonly baseUrl = 'https://www.xn--l3c0azab5a2gta.com';
}

export default defineExtension({
  createSource: () => new Sodsaime().toSource(),
});
