import { defineExtension } from '@matane/extension-sdk';
import { ADULT_PREFERENCE, FoolSlide } from './foolslide/FoolSlide';

class NIFTeam extends FoolSlide {
  readonly name = 'NIF Team';
  readonly baseUrl = 'https://read-nifteam.info';
  override urlModifier = '/slide';
}

export default defineExtension({
  preferences: () => [ADULT_PREFERENCE],
  createSource: () => new NIFTeam().toSource(),
});
