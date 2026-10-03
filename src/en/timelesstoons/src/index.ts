import { defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';

class TimelessToons extends Keyoapp {
  readonly name = 'TimelessToons';
  readonly baseUrl = 'https://timelesstoons.org';

  override popularMangaSelector(): string {
    return 'div:has(> h2:contains(Trending)) + div .group';
  }
  override latestUpdatesSelector(): string {
    return 'div.grid > div.group.latest-poster';
  }
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new TimelessToons().toSource(),
});
