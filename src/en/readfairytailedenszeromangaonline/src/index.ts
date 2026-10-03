import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadFairyTailEdensZeroMangaOnline extends MangaCatalog {
  readonly name = 'Read Fairy Tail & Edens Zero Manga Online';
  readonly sourceList: [string, string][] = [
    ["Eden's Zero", '/manga/edens-zero/'],
    ['Fairy Tail', '/manga/fairy-tail/'],
    ['FT Zero', '/manga/fairy-tail-zero/'],
    ['FT City Hero', '/manga/fairy-tail-city-hero/'],
    ['Hero’s', '/manga/heros/'],
    ['FT Happy Adv', '/manga/fairy-tail-happys-grand-adventure/'],
    ['FT 100 Year', '/manga/fairy-tail-100-years-quest/'],
    ['FT Ice Trail', '/manga/fairy-tail-ice-trail/'],
    ['FT x Taizai', '/manga/fairy-tail-x-nanatsu-no-taizai-christmas-special/'],
    ['Parasyte x FT', '/manga/parasyte-x-fairy-tail/'],
    ['Gaiden 1', '/manga/fairy-tail-gaiden-raigo-issen/'],
    ['FT x Rave', '/manga/fairy-tail-x-rave/'],
    ['Monster Hunter', '/manga/monster-hunter-orage/'],
    ['Rave Master', '/manga/rave-master/'],
    ['Dead Rock', '/manga/dead-rock/'],
    ['Fairy Girls', '/manga/fairy-girls/'],
    ['Gaiden 4', '/manga/fairy-tail-gaiden-raigo-issen/'],
    ['Gaiden 2', '/manga/fairy-tail-gaiden-kengami-no-souryuu/'],
    ['Gaiden 3', '/manga/fairy-tail-gaiden-road-knight/'],
    ['FT x 7DS', '/manga/fairy-tail-x-nanatsu-no-taizai-christmas-special/'],
  ];
  readonly baseUrl = 'https://ww9.readfairytail.com';
}

export default defineExtension({
  createSource: () => new ReadFairyTailEdensZeroMangaOnline().toSource(),
});
