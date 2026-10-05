import { defineExtension } from '@matane/extension-sdk';
import { InkStory } from './inkstory/InkStory';

class InkStorySource extends InkStory {
  readonly name = 'InkStory';
  readonly baseUrl = 'https://inkstory.net';
  readonly serviceName = 'inkstory';
}

export default defineExtension({
  preferences: () => new InkStorySource().preferences(),
  createSource: () => new InkStorySource().toSource(),
});
