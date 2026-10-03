import { defineExtension } from '@matane/extension-sdk';
import { ADULT_PREFERENCE, FoolSlide } from './foolslide/FoolSlide';

class Mangatellers extends FoolSlide {
  readonly name = 'Mangatellers';
  readonly baseUrl = 'https://reader.mangatellers.gr';
}

export default defineExtension({
  preferences: () => [ADULT_PREFERENCE],
  createSource: () => new Mangatellers().toSource(),
});
