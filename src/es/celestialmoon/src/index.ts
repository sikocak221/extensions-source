import { type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class CelestialMoon extends MangaThemesia {
  readonly name = 'Celestial Moon';
  readonly baseUrl = 'https://celestialmoonscan.es';

  override headers(): Record<string, string> {
    return { ...super.headers(), Cookie: 'age_gate=18' };
  }

  // The series urls here have 1 path segment(s), not the theme's two.
  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || !this.baseUrl.includes(match[1]!)) return null;
    const segments = (match[2] ?? '').split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    return { url: `/${segments.join('/')}${(match[2] ?? '').endsWith('/') ? '/' : ''}`, title: '' };
  }
}

export default defineExtension({
  createSource: () => new CelestialMoon().toSource(),
});
