import { defineExtension } from '@matane/extension-sdk';
import { GroupLe } from './grouple/GroupLe';

class SeiManga extends GroupLe {
  readonly name = 'SeiManga';
  readonly baseUrl = 'https://1.seimanga.me';
}

export default defineExtension({
  preferences: () => new SeiManga().preferences(),
  createSource: () => new SeiManga().toSource(),
});
