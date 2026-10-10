import { type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { Guya } from './guya/Guya';

class MagicalTranslators extends Guya {
  constructor(readonly lang: string) {
    super();
  }

  readonly name = 'Magical Translators';
  readonly baseUrl = 'https://mahoushoujobu.com';

  override filterMangas(items: MangaSummary[]): MangaSummary[] {
    switch (this.lang) {
      case 'en':
        return items.filter((m) => !m.url.endsWith('-ES') && !m.url.endsWith('-PL'));
      case 'es':
        return items.filter((m) => m.url.endsWith('-ES'));
      case 'pl':
        return items.filter((m) => m.url.endsWith('-PL'));
      default:
        throw new Error(`Unknown language: ${this.lang}`);
    }
  }
}

export default defineExtension({
  createSource: ({ lang }) => new MagicalTranslators(lang).toSource(),
});
