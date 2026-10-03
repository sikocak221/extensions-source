import { defineExtension } from '@matane/extension-sdk';
import { MangAdventure } from './mangadventure/MangAdventure';

class ArcRelight extends MangAdventure {
  readonly name = 'Arc-Relight';
  readonly baseUrl = 'https://arc-relight.com';

  override categories = [
    '4-Koma',
    'Chaos;Head',
    'Collection',
    'Comedy',
    'Drama',
    'Jubilee',
    'Mystery',
    'Psychological',
    'Robotics;Notes',
    'Romance',
    'Sci-Fi',
    'Seinen',
    'Shounen',
    'Steins;Gate',
    'Supernatural',
    'Tragedy',
  ];
}

export default defineExtension({
  createSource: () => new ArcRelight().toSource(),
});
