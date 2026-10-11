import { defineExtension } from '@matane/extension-sdk';
import { NatsuId } from './natsuid/NatsuId';

class Rawkuma extends NatsuId {
  readonly name = 'Rawkuma';
  readonly baseUrl = 'https://rawkuma.net';
}

export default defineExtension({
  createSource: () => new Rawkuma().toSource(),
});
