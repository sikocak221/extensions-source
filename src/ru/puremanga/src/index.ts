import { defineExtension } from '@matane/extension-sdk';
import { InkStory } from './inkstory/InkStory';

class PureManga extends InkStory {
  readonly name = 'PureManga';
  readonly baseUrl = 'https://v1.puremanga.me';
  readonly serviceName = 'puremanga.me';
}

export default defineExtension({
  preferences: () => new PureManga().preferences(),
  createSource: () => new PureManga().toSource(),
});
