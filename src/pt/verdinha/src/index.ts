import { defineExtension } from '@matane/extension-sdk';
import { GreenShit, LOGIN_PREFERENCES } from './greenshit/GreenShit';

class Verdinha extends GreenShit {
  readonly name = 'Verdinha';
  readonly baseUrl = 'https://verdinha.wtf';
  readonly apiUrl = 'https://api.verdinha.wtf';
  readonly cdnUrl = 'https://cdn.verdinha.wtf';
  readonly cdnApiUrl = 'https://api.verdinha.wtf/cdn';
  readonly scanId = '1';
}

export default defineExtension({
  preferences: () => LOGIN_PREFERENCES,
  createSource: () => new Verdinha().toSource(),
});
