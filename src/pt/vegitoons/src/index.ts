import { type Chapter, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { GreenShit, LOGIN_PREFERENCES } from './greenshit/GreenShit';

class Vegitoons extends GreenShit {
  readonly name = 'Vegitoons';
  readonly baseUrl = 'https://vegitoons.black';
  readonly apiUrl = 'https://api.vegitoons.black';
  readonly cdnUrl = 'https://cdn.vegitoons.black';
  readonly cdnApiUrl = 'https://api.vegitoons.black/cdn';
  readonly scanId = '1';

  override getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url}`;
  }
}

export default defineExtension({
  preferences: () => LOGIN_PREFERENCES,
  createSource: () => new Vegitoons().toSource(),
});
