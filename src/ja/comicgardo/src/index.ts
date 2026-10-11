import { defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class ComicGardo extends GigaViewer {
  readonly name = 'Comic Gardo';
  readonly baseUrl = 'https://comic-gardo.com';

  override seriesListIds = ['10834108156664921090'];

  override filterOptions(): [string, string[]][] {
    return [
      ['連載作品', this.seriesListIds],
      ['アンソロジー・読切', ['2551460909910482483']],
      ['連載終了作品', ['10834108156664921091']],
    ];
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new ComicGardo().toSource(),
});
