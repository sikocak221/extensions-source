import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class Zazamanga extends MadaraNoAjax {
  readonly name = 'Zazamanga';
  readonly baseUrl = 'https://www.zazamanga.com';

  override chapterListSelector(): string {
    return 'div.wp-manga-chapter';
  }
}

export default defineExtension({
  createSource: () => new Zazamanga().toSource(),
});
