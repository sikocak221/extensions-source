import { defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class KurageBunch extends GigaViewer {
  readonly name = 'Kurage Bunch';
  readonly baseUrl = 'https://kuragebunch.com';

  override seriesListIds = ['13933686331612818223', '316112896902234328', '316112896902234338', '316112896902234351'];

  override filterOptions(): [string, string[]][] {
    return [
      ['くらげバンチ', this.seriesListIds],
      ['読切', ['13933686331612818248']],
      ['月刊コミックバンチ', ['316112896902234380', '316112896902234391']],
      ['KANATA', ['14079602755178190495', '14079602755178190507', '14079602755178190520']],
      ['ドラマ', ['Genre:3270375685434986756']],
      ['グルメ', ['Genre:3270375685434986819']],
      ['恋愛', ['Genre:3270375685434986861']],
      ['エロス', ['Genre:3270375685434986895']],
      ['コメディ', ['Genre:3270375685434986939']],
      ['動物', ['Genre:3270375685434986972']],
      ['エッセイ・ノンフィクション', ['Genre:3270375685434987001']],
      ['ファンタジー', ['Genre:3270375685434987045']],
      ['アクション', ['Genre:3270375685434987087']],
      ['趣味', ['Genre:3270375685434987121']],
      ['日常', ['Genre:3270375685434987160']],
      ['ホラー', ['Genre:3270375685434987197']],
      ['スポーツ', ['Genre:3270375685434987232']],
      ['SF', ['Genre:3270375685434987276']],
      ['歴史', ['Genre:2551460910062589035']],
    ];
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new KurageBunch().toSource(),
});
