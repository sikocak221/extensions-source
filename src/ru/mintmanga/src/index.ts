import { defineExtension } from '@matane/extension-sdk';
import { GroupLe } from './grouple/GroupLe';

class MintManga extends GroupLe {
  readonly name = 'MintManga';
  readonly baseUrl = 'https://2.mintmanga.one';
}

export default defineExtension({
  preferences: () => new MintManga().preferences(),
  createSource: () => new MintManga().toSource(),
});
