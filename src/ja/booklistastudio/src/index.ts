import { defineExtension } from '@matane/extension-sdk';
import { ComiciViewer } from './comiciviewer/ComiciViewer';

class BooklistaStudio extends ComiciViewer {
  readonly name = 'Booklista Studio';
  readonly baseUrl = 'https://studio.booklista.co.jp';
}

export default defineExtension({
  preferences: () => new BooklistaStudio().preferences(),
  createSource: () => new BooklistaStudio().toSource(),
});
