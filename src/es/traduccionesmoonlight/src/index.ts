import { defineExtension } from '@matane/extension-sdk';
import { MoonlightTL } from './moonlighttl/MoonlightTL';

class TraduccionesMoonlight extends MoonlightTL {
  readonly name = 'Traducciones Moonlight';
  readonly baseUrl = 'https://traduccionesmoonlight.com';
  readonly lang = 'es';
}

export default defineExtension({
  createSource: () => new TraduccionesMoonlight().toSource(),
});
