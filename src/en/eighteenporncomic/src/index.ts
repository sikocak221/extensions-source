import { defineExtension } from '@matane/extension-sdk';
import { Manga18 } from './manga18/Manga18';

class _18PornComic extends Manga18 {
  readonly name = '18 Porn Comic';
  readonly baseUrl = 'https://18porncomic.com';
}

export default defineExtension({
  createSource: () => new _18PornComic().toSource(),
});
