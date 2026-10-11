import { defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class ComicEarthStar extends GigaViewer {
  readonly name = 'Comic Earth Star';
  readonly baseUrl = 'https://comic-earthstar.com';

  override seriesListIds = ['14079602755185553136', '14079602755185553138', '14079602755185553142'];

  override filterOptions(): [string, string[]][] {
    return [
      ['すべて', this.seriesListIds],
      ['連載中', ['14079602755185553136']],
      ['連載終了', ['14079602755185553138']],
      ['読切作品', ['14079602755185553142']],
      ['コミカライズ', ['Genre:12207421983825514342']],
      ['オリジナル', ['Genre:12207421983825514347']],
      ['青年', ['Genre:12207421983825514353']],
      ['女性', ['Genre:12207421983825514356']],
      ['アニメ化', ['Genre:12207421983825514357']],
      ['ファンタジー', ['Genre:12207421983825514361']],
      ['アクション・バトル', ['Genre:12207421983825514365']],
      ['恋愛', ['Genre:12207421983825514369']],
      ['ホラー・ミステリー', ['Genre:12207421983825514370']],
      ['日常', ['Genre:12207421983825514371']],
      ['歴史・時代', ['Genre:12207421983825514374']],
      ['スポーツ', ['Genre:12207421983825514379']],
      ['グルメ', ['Genre:12207421983825514385']],
      ['開発・開拓', ['Genre:12207421983825514389']],
      ['動物', ['Genre:12207421983825514390']],
    ];
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new ComicEarthStar().toSource(),
});
