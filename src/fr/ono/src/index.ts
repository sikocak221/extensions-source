import { defineExtension } from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://www.ono.live';

// TODO: port from Tachiyomi
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
  }),
});
