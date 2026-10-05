import type { Filter } from '@matane/extension-sdk';

export const FILTERS: Filter[] = [
  {
    type: 'select',
    id: 'type',
    label: 'Tipo',
    default: '',
    options: [
      { label: 'Ver todo', value: '' },
      { label: 'Manhwa', value: 'manhwa' },
      { label: 'Manga', value: 'manga' },
    ],
  },
  {
    type: 'select',
    id: 'demography',
    label: 'Demografía',
    default: '',
    options: [
      { label: 'Ver todo', value: '' },
      { label: 'Seinen', value: 'seinen' },
      { label: 'Shonen', value: 'shonen' },
      { label: 'Josei', value: 'josei' },
    ],
  },
  {
    type: 'select',
    id: 'status',
    label: 'Estado',
    default: '',
    options: [
      { label: 'Ver todo', value: '' },
      { label: 'Publicándose', value: 'publicandose' },
    ],
  },
  {
    type: 'select',
    id: 'erotic',
    label: 'Erótico',
    default: '',
    options: [
      { label: 'Ver todo', value: '' },
      { label: 'Sí', value: 'si' },
    ],
  },
];

export const GENRES: [string, number][] = [
  ['Acción', 3],
  ['Aventura', 29],
  ['Comedia', 18],
  ['Drama', 1],
  ['Recuentos de la vida', 42],
  ['Romance', 2],
  ['Venganza', 5],
  ['Harem', 6],
  ['Fantasia', 23],
  ['Sobrenatural', 31],
  ['Tragedia', 25],
  ['Psicológico', 43],
  ['Horror', 32],
  ['Thriller', 44],
  ['Historias cortas', 28],
  ['Ecchi', 30],
  ['Gore', 34],
  ['Girls love', 27],
  ['Boys love', 45],
  ['Reencarnación', 41],
  ['Sistema de niveles', 37],
  ['Ciencia ficción', 33],
  ['Apocalíptico', 38],
  ['Artes Marciales', 39],
  ['Superpoderes', 40],
  ['Cultivación (cultivo)', 35],
  ['Milf', 8],
];
