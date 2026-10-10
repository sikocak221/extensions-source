import { defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class MAGCOMI extends GigaViewer {
  readonly name = 'MAGCOMI';
  readonly baseUrl = 'https://magcomi.com';

  override seriesListIds = ['2550689798442777403', '2550689798442777409'];

  override filterOptions(): [string, string[]][] {
    return [
      ['連載中', this.seriesListIds],
      ['読切', ['2550689798442777417', '2550689798442777419', '2550689798442777427']],
      ['漫画賞・他', ['2550689798442777432', '2550689798442777435']],
      ['完結・休止', ['2550689798442777437', '2550689798442777447']],
      ['ファンタジー', ['Genre:3269754496757284079']],
      ['SFアクション', ['Genre:3269754496757284092']],
      ['男性向け「異世界」', ['Genre:3269754496757284093']],
      ['女性向け「異世界」', ['Genre:3269754496757284105']],
      ['ギャグ/コメディ', ['Genre:3269754496757284113']],
      ['料理/グルメ', ['Genre:3269754496757284121']],
      ['恋愛', ['Genre:3269754496757284122']],
      ['BL', ['Genre:3269754496757284126']],
      ['百合/GL', ['Genre:3269754496757284132']],
      ['歴史/時代劇', ['Genre:3269754496757284140']],
      ['ホラー/サスペンス/ミステリー', ['Genre:3269754496757284144']],
      ['エッセイ/日常', ['Genre:3269754496757284147']],
      ['ヒューマンドラマ', ['Genre:3269754496757284148']],
      ['学園/職業', ['Genre:3269754496757284151']],
      ['自然/動物', ['Genre:3269754496757284155']],
      ['スポーツ', ['Genre:3269754496757284157']],
    ];
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new MAGCOMI().toSource(),
});
