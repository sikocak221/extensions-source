import { defineExtension } from '@matane/extension-sdk';
import { GroupLe } from './grouple/GroupLe';

class SelfManga extends GroupLe {
  readonly name = 'SelfManga';
  readonly baseUrl = 'https://1.selfmanga.live';
}

export default defineExtension({
  preferences: () => new SelfManga().preferences(),
  createSource: () => new SelfManga().toSource(),
});
