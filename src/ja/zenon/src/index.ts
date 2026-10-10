import { defineExtension } from '@matane/extension-sdk';
import {
  GigaViewer,
  type ReadableProduct,
  HIDE_LOCKED_PREFERENCE,
  HIDE_UNAVAILABLE_PREFERENCE,
} from './gigaviewer/GigaViewer';

class Zenon extends GigaViewer {
  readonly name = 'Zenon';
  readonly baseUrl = 'https://comic-zenon.com';

  override seriesListIds = [
    '12207421983695504181',
    '12207421983695504182',
    '12207421983695504186',
    '12207421983695504189',
    '12207421983695504190',
    '12207421983695504198',
    '12207421983695504201',
    '10834108156697286365',
    '10834108156697286367',
    '10834108156697286369',
  ];

  override filterOptions(): [string, string[]][] {
    return [
      ['連載作品', this.seriesListIds],
      ['読切作品', ['10834108156697286370']],
      ['漫画賞', ['14079602755177733270']],
      ['アングラ・麻薬・ドラッグ', ['Genre:2550912965876210064']],
      ['怪異・ホラー・ミステリー', ['Genre:2550912965876210087']],
      ['サスペンス', ['Genre:2550912965876210090']],
      ['いじめ・復讐', ['Genre:2550912965876210101']],
      ['お仕事', ['Genre:2550912965876210110']],
      ['医療', ['Genre:2550912965876210117']],
      ['スポーツ', ['Genre:2550912965876210128']],
      ['文化系スポ根', ['Genre:2550912965876210140']],
      ['グルメ', ['Genre:2550912965876210143']],
      ['日常', ['Genre:2550912965876210150']],
      ['ラブコメ', ['Genre:2550912965876210156']],
      ['バトル', ['Genre:2550912965876210160']],
      ['推し', ['Genre:2550912965876210168']],
      ['ヒューマンドラマ', ['Genre:2550912965876210181']],
      ['男性向け異世界', ['Genre:2550912965876210184']],
      ['女性向け異世界', ['Genre:2550912965876210188']],
      ['男性向け歴史', ['Genre:2550912965876210190']],
      ['女性向け歴史', ['Genre:2550912965876210194']],
      ['大人向け恋愛', ['Genre:2550912965876210204']],
      ['若年向け恋愛', ['Genre:2550912965876210217']],
    ];
  }

  // Closed chapters are reported as free here, only their missing status gives them away
  override isUnavailable(product: ReadableProduct): boolean {
    return product.purchase_info.unavailable || product.status == null;
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new Zenon().toSource(),
});
