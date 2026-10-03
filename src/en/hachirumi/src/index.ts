import { defineExtension } from '@matane/extension-sdk';
import { Guya, PREFERRED_GROUP_PREFERENCE } from './guya/Guya';

class Hachirumi extends Guya {
  readonly name = 'Hachirumi';
  readonly baseUrl = 'https://hachirumi.com';
}

export default defineExtension({
  preferences: () => [PREFERRED_GROUP_PREFERENCE],
  createSource: () => new Hachirumi().toSource(),
});
