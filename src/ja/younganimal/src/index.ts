import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class YoungAnimal extends ComiciViewer {
  readonly name = 'Young Animal';
  override extraFilterOptions(): [string, string][] {
    return [['グラビア', '/category/gravure']];
  }

  readonly baseUrl = 'https://younganimal.com';
}

export default defineExtension({
  preferences: () => new YoungAnimal().preferences(),
  createSource: () => new YoungAnimal().toSource(),
});
