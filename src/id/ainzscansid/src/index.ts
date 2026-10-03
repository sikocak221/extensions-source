import { type Page, defineExtension } from '@matane/extension-sdk';
import { type ChapterPagesResponseDto, LoneSeal, OVERLOADED_GENRES } from './loneseal/LoneSeal';

const AD_DOMAIN = /^999(?:-\d+)?\.jpe?g$/;
const AD_DONATION = /^997(?:-\d+)?\.jpe?g$/;
const AD_VOTE_PRE = /^00\.0\.jpg$/;
const AD_READ_ON = /^00\.1\.jpg$/;
const AD_VOTE_POST = /^995\.jpg$/;

class AinzScansID extends LoneSeal {
  readonly name = 'Ainz Scans ID';
  readonly baseUrl = 'https://v3.ainzscans01.com';

  override urlLayout = 'LEGACY_COMIC' as const;
  override includeProjectOnlyFilter = true;
  override overloadedGenres = [...OVERLOADED_GENRES, 'adventure'];

  // Drops the site's ad pages (vote, donation, domain notice) and asks for full-size images.
  override toPageList(dto: ChapterPagesResponseDto): Page[] {
    const pages = dto.chapter?.pages ?? [];
    const last = pages.length - 1;
    return pages.flatMap((page, i): Page[] => {
      const url = cleanUp(page.image_url);
      const filename =
        url
          .replace(/[?#].*$/, '')
          .split('/')
          .pop() ?? '';
      const isAd =
        (i === last && AD_DOMAIN.test(filename)) ||
        (i === last - 2 && (AD_DONATION.test(filename) || AD_VOTE_POST.test(filename))) ||
        (i === 0 && AD_VOTE_PRE.test(filename)) ||
        (i === 1 && AD_READ_ON.test(filename));
      return isAd ? [] : [{ index: i, imageUrl: url }];
    });
  }
}

function cleanUp(raw: string): string {
  let url = raw.startsWith('http') ? raw : `https://api.ainzscans01.com${raw.startsWith('/') ? '' : '/'}${raw}`;
  // Older chapters use compressed Blogger images.
  if (url.includes('googleusercontent.com') || url.includes('bp.blogspot.com')) {
    url = url.replace(/=[swh]\d+[^/?]*($|\?)/i, '=s0$1').replace(/\/[swh]\d+[^/]*\//i, '/s0/');
  }
  // CMS resizing parameters.
  const [path, query] = url.split('?');
  if (query) {
    const kept = query.split('&').filter((pair) => !/^(w|width|resize)=/.test(pair));
    url = kept.length > 0 ? `${path}?${kept.join('&')}` : path!;
  }
  return url;
}

export default defineExtension({
  createSource: () => new AinzScansID().toSource(),
});
