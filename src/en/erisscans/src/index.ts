import { defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';

class ErisScans extends Keyoapp {
  readonly name = 'Eris Scans';
  readonly baseUrl = 'https://erisscans.com';

  override altNameSelector = 'div.font-medium:contains(Alternative titles) ~ div span.select-all';
  override statusSelector = 'div[alt=Status]';
  override authorSelector = 'div[alt=Author]';
  override artistSelector = 'div[alt=Artist]';
  override typeSelector = "div[alt='Series Type']";
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new ErisScans().toSource(),
});
