import { defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class TonarinoYoungJump extends GigaViewer {
  readonly name = 'Tonari no Young Jump';
  readonly baseUrl = 'https://tonarinoyj.jp';

  override seriesListIds = ['3269632237330951493', '3269632237330951504'];

  override filterOptions(): [string, string[]][] {
    return [
      ['連載中', this.seriesListIds],
      ['読切', ['3269632237330951514', '3269632237330951522', '10834108156636443058']],
      ['出張作品', ['3269632237330951523', '3269632237330951526']],
      ['アクション', ['Genre:2550912966013206559']],
      ['日常/コメディ', ['Genre:2550912966013206575']],
      ['セクシー', ['Genre:2550912966013206580']],
      ['ファンタジー', ['Genre:2550912966013206593']],
      ['グルメ', ['Genre:2550912966013206600']],
      ['ホラー/ミステリー', ['Genre:2550912966013206611']],
      ['復讐', ['Genre:2550912966013206615']],
      ['スポ根', ['Genre:2550912966013206624']],
      ['異世界', ['Genre:2550912966013206635']],
    ];
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new TonarinoYoungJump().toSource(),
});
