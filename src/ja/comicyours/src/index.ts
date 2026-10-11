import { defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class ComicYOURs extends GigaViewer {
  readonly name = 'Comic Y-OURs';
  readonly baseUrl = 'https://comic-y-ours.com';

  override seriesListIds = ['2551460909784457710', '2551460909784457714', '2551460909784457715'];

  override filterOptions(): [string, string[]][] {
    return [
      ['すべて', this.seriesListIds],
      ['読切作品', ['2551460909784457719']],
    ];
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new ComicYOURs().toSource(),
});
