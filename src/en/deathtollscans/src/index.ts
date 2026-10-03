import { defineExtension } from '@matane/extension-sdk';
import { ADULT_PREFERENCE, FoolSlide } from './foolslide/FoolSlide';

class DeathTollScans extends FoolSlide {
  readonly name = 'Death Toll Scans';
  readonly baseUrl = 'https://reader.deathtollscans.net';
}

export default defineExtension({
  preferences: () => [ADULT_PREFERENCE],
  createSource: () => new DeathTollScans().toSource(),
});
