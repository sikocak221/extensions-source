import { defineExtension } from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://www.japscan.foo';

// TODO: port from Tachiyomi
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
  }),
});
