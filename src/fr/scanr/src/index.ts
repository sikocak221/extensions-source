import { defineExtension } from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://teamscanr.fr';

// TODO: port from Tachiyomi
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
  }),
});
