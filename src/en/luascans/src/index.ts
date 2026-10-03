import { defineExtension } from '@matane/extension-sdk';
import { HeanCms, SHOW_PAID_CHAPTERS_PREFERENCE } from './heancms/HeanCms';

class LuaScans extends HeanCms {
  readonly name = 'Lua Scans';
  readonly baseUrl = 'https://luacomic.org';

  override latestSortBy = 'asc';
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new LuaScans().toSource(),
});
