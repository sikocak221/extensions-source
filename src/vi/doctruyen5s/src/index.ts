import { defineExtension } from '@matane/extension-sdk';
import { Liliana } from './liliana/Liliana';

class DocTruyen5s extends Liliana {
  readonly name = 'DocTruyen5s';
  readonly baseUrl = 'https://manga.io.vn';
}

export default defineExtension({
  createSource: () => new DocTruyen5s().toSource(),
});
