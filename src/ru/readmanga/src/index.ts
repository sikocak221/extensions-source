import { defineExtension } from '@matane/extension-sdk';
import { GroupLe } from './grouple/GroupLe';

class ReadManga extends GroupLe {
  readonly name = 'ReadManga';
  readonly baseUrl = 'https://a.zazaza.me';
}

export default defineExtension({
  preferences: () => new ReadManga().preferences(),
  createSource: () => new ReadManga().toSource(),
});
