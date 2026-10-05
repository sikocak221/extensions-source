import { type Filter, defineExtension } from '@matane/extension-sdk';
import { Manga18 } from './manga18/Manga18';

class HANMAN18 extends Manga18 {
  readonly name = 'HANMAN18';
  readonly baseUrl = 'https://hanman18.com';

  // The tag filter doesn't work on the site.
  override async getFilters(): Promise<Filter[]> {
    return (await super.getFilters()).filter((filter) => !('id' in filter && filter.id === 'tag'));
  }
}

export default defineExtension({
  createSource: () => new HANMAN18().toSource(),
});
