import { defineExtension } from '@matane/extension-sdk';
import { MCCMSWeb } from './mccms/MCCMSWeb';

class Manhuawu extends MCCMSWeb {
  readonly name = 'Manhuawu';
  readonly baseUrl = 'https://www.mhua5.com';
}

export default defineExtension({
  createSource: () => new Manhuawu().toSource(),
});
