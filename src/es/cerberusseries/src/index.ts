import { type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class CerberusSeries extends MangaThemesia {
  readonly name = 'Cerberus Series';
  readonly baseUrl = 'https://legionscans.com/wp';

  // The base url already ends with the "/wp" directory that the stored urls start with.
  override absolute(url: string): string {
    return super.absolute(url.startsWith('/wp/') ? url.slice(3) : url);
  }

  // The series urls here have 3 path segment(s), not the theme's two.
  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || !this.baseUrl.includes(match[1]!)) return null;
    const segments = (match[2] ?? '').split('/').filter(Boolean);
    if (segments.length !== 3) return null;
    return { url: `/${segments.join('/')}${(match[2] ?? '').endsWith('/') ? '/' : ''}`, title: '' };
  }
}

export default defineExtension({
  createSource: () => new CerberusSeries().toSource(),
});
