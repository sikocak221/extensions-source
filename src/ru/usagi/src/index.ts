import { defineExtension } from '@matane/extension-sdk';
import { GroupLe } from './grouple/GroupLe';

class Usagi extends GroupLe {
  readonly name = 'Usagi';
  readonly baseUrl = 'https://web.usagi.one';
}

export default defineExtension({
  preferences: () => new Usagi().preferences(),
  createSource: () => new Usagi().toSource(),
});
