import { defineExtension } from '@matane/extension-sdk';
import { Iken, SHOW_LOCKED_CHAPTERS_PREFERENCE } from './iken/Iken';

class Renascans extends Iken {
  readonly name = 'Renascans';
  readonly baseUrl = 'https://renascans.net';
}

export default defineExtension({
  preferences: () => [SHOW_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new Renascans().toSource(),
});
