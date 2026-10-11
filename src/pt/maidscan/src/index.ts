import { defineExtension } from '@matane/extension-sdk';
import { GreenShit, LOGIN_PREFERENCES, type Pair } from './greenshit/GreenShit';

class MaidScan extends GreenShit {
  readonly name = 'Maid Scan';
  readonly baseUrl = 'https://empreguetes.wtf';
  readonly apiUrl = 'https://api.verdinha.wtf';
  readonly cdnUrl = 'https://cdn.verdinha.wtf';
  readonly cdnApiUrl = 'https://api.verdinha.wtf/cdn';
  readonly scanId = '3';
  override defaultGenreId = '4';
  override formatsList: Pair[] = [
    ['Todos', ''],
    ['Manhwa', '16'],
    ['Novel', '17'],
  ];
  override statusList: Pair[] = [
    ['Todos', ''],
    ['Cancelado', '13'],
    ['Completo', '12'],
    ['Em Andamento', '10'],
    ['Hiato', '11'],
  ];
}

export default defineExtension({
  preferences: () => LOGIN_PREFERENCES,
  createSource: () => new MaidScan().toSource(),
});
