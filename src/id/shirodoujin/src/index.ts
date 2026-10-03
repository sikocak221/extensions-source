import { defineExtension } from '@matane/extension-sdk';
import { ZManga } from './zmanga/ZManga';

class ShiroDoujin extends ZManga {
  readonly name = 'Shiro Doujin';
  readonly baseUrl = 'https://shirodoujin.com';

  override hasProjectPage = true;
}

export default defineExtension({
  createSource: () => new ShiroDoujin().toSource(),
});
