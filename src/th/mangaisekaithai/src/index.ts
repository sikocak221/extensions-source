import { type HtmlElement, type ImageTransform, type Page, type Source, defineExtension } from '@matane/extension-sdk';
import { imageSize } from './image';
import { MadaraNoAjax } from './madara/MadaraNoAjax';
import { unpack } from './packer';

const BLOCK_WIDTH = /width:\s*"?\s*\+?\s*(\d+)\s*\+?\s*"?px;/;
const BLOCK_HEIGHT = /height:\s*"?\s*\+?\s*(\d+)\s*\+?\s*"?px;/;

interface ScramblingData {
  blockWidth: number;
  blockHeight: number;
  /** [destX, destY, srcX, srcY] per block. */
  matrix: number[][];
}

// Descrambling logic from ManhuaKey: some pages are a packed script that tells how to rebuild the picture.
const THAI_MONTHS: [string, string][] = [
  ['มกราคม', 'January'],
  ['กุมภาพันธ์', 'February'],
  ['มีนาคม', 'March'],
  ['เมษายน', 'April'],
  ['พฤษภาคม', 'May'],
  ['มิถุนายน', 'June'],
  ['กรกฎาคม', 'July'],
  ['สิงหาคม', 'August'],
  ['กันยายน', 'September'],
  ['ตุลาคม', 'October'],
  ['พฤศจิกายน', 'November'],
  ['ธันวาคม', 'December'],
];

class MangaIsekaiThai extends MadaraNoAjax {
  readonly name = 'MangaIsekaiThai';
  readonly baseUrl = 'https://www.mangaisekaithai.net';

  override chapterDatePattern = 'd MMMM yyyy';
  override supportsLatest = false;
  override chapterMode = 'MangaAjax' as const;
  override pageListParseSelector = '.reading-content img, .reading-content div.displayImage + script';

  override parsePages(document: HtmlElement): Page[] {
    const urls: string[] = [];
    for (const element of document.select(this.pageListParseSelector)) {
      const script = element.html() ?? '';
      if (!script.includes('p,a,c,k,e,d')) {
        const url = this.imageFromElement(element);
        if (url) urls.push(url);
        continue;
      }
      const unpacked = unpack(script);
      const blockWidth = Number(BLOCK_WIDTH.exec(unpacked)![1]);
      const blockHeight = Number(BLOCK_HEIGHT.exec(unpacked)![1]);
      const matrix = JSON.parse(`[${unpacked.slice(unpacked.indexOf('[') + 1).split('];')[0]}]`) as number[][];
      const imageUrl = unpacked.slice(unpacked.indexOf('url(') + 4).split(');')[0]!;
      const data: ScramblingData = { blockWidth, blockHeight, matrix };
      urls.push(`${imageUrl}#${encodeURIComponent(JSON.stringify(data))}`);
    }
    return urls.map((imageUrl, index) => ({ index, imageUrl }));
  }

  transformImage(page: Page, bytes: Uint8Array): ImageTransform {
    const fragment = (page.imageUrl ?? '').split('#')[1];
    if (!fragment) return {};
    const { blockWidth, blockHeight, matrix } = JSON.parse(decodeURIComponent(fragment)) as ScramblingData;
    const size = imageSize(bytes);
    if (!size) return {};
    return {
      tiles: {
        width: size[0],
        height: size[1],
        ops: matrix.map(([dx, dy, sx, sy]) => ({ sx: sx!, sy: sy!, w: blockWidth, h: blockHeight, dx: dx!, dy: dy! })),
      },
    };
  }

  override toSource(): Source {
    return { ...super.toSource(), transformImage: (page, bytes) => this.transformImage(page, bytes) };
  }

  // The sites write months in Thai ("25 กันยายน 2026").
  override parseChapterDate(date: string | null | undefined): number | undefined {
    return super.parseChapterDate(
      date && THAI_MONTHS.reduce((text, [thai, english]) => text.replace(thai, english), date),
    );
  }
}

export default defineExtension({
  createSource: () => new MangaIsekaiThai().toSource(),
});
