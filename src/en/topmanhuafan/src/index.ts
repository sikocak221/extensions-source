import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class TopManhuafan extends MadaraNoAjax {
  readonly name = 'TopManhua.fan';
  readonly baseUrl = 'https://www.topmanhua.fan';

  override chapterDatePattern = 'MM/dd/yyyy';
  override mangaSubString = 'manhua';
  override chapterListSelector(): string {
    return 'div.wp-manga-chapter';
  }
}

export default defineExtension({
  createSource: () => new TopManhuafan().toSource(),
});
