// Clip Studio Reader, ported from keiyoushi/extensions-source lib/clipstudioreader (the comic viewer; the EPUB
// viewer is not supported). This directory is a template: every extension using it keeps an identical copy in
// src/clipstudioreader/ (`node scripts/sync-multisrc.mjs`). A source extends this class and calls `fetchPages`.
//
// Page urls are the viewer's page XML urls with a fragment `csr-page,<grid width>,<grid height>[,<half>]`;
// `transformImage` reads the page XML it is given, downloads the real image and unscrambles it.
import type {
  Chapter,
  ImageTransform,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  TileOp,
} from '@matane/extension-sdk';
import { imageSize } from './image';
import { USER_AGENT } from './utils';

const MODE_FACE_XML = '7';
const MODE_PAGE_XML = '8';
const MODE_TIME_KEY = '999';
const VIEW_MODE_VERTICAL = '2';
const VIEW_MODE_HYBRID = '4';
const CODE_SUCCESS = '1000';
const CODE_VIEW_MODE_ERROR = '2005';
const PAGE_FRAGMENT = 'csr-page';
const HALF_LEFT = 'L';
const HALF_RIGHT = 'R';
const IMAGE_KINDS = ['1', '2', '3']; // JPEG, GIF, PNG

const query = (params: [string, string][]) =>
  params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

/** Value of a query parameter, percent-decoded (a literal "+" stays a plus). */
function queryParameter(url: string, name: string): string | undefined {
  const raw = (url.split('#')[0]!.split('?')[1] ?? '')
    .split('&')
    .map((pair) => pair.split('='))
    .find(([key]) => key === name)?.[1];
  return raw === undefined ? undefined : decodeURIComponent(raw);
}

export abstract class ClipStudioReader {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  headers(): Record<string, string> {
    return { 'User-Agent': USER_AGENT, Referer: `${this.baseUrl}/` };
  }

  async xml(url: string) {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: url, xml: true });
  }

  /** Pages of a viewer url that carries `cgi` and `param` (and `trial`), or of a loaded viewer page. */
  async fetchPages(viewerUrl: string, body?: string): Promise<Page[]> {
    let cgi = queryParameter(viewerUrl, 'cgi');
    let param = queryParameter(viewerUrl, 'param');
    let trial = queryParameter(viewerUrl, 'trial');
    if (queryParameter(viewerUrl, 'c') !== undefined) throw new Error('Unsupported viewer: EPUB books cannot be read');
    if ((!cgi || !param) && body) {
      const meta = html.load(body, { baseUrl: viewerUrl }).selectFirst('div#meta');
      cgi = meta?.selectFirst('input[name=cgi]')?.absUrl('value');
      param = meta?.selectFirst('input[name=param]')?.attr('value');
      trial = meta?.selectFirst('input[name=trial]')?.attr('value');
    }
    if (!cgi || !param) throw new Error('Viewer parameters not found');
    return this.fetchComicPages(cgi, param.replace(/ /g, '+'), trial);
  }

  fileUrl(cgi: string, mode: string, file: string, viewMode: string, key: string): string {
    return `${cgi}?${query([
      ['mode', mode],
      ['reqtype', '0'],
      ['vm', viewMode],
      ['file', file],
      ['param', key],
    ])}`;
  }

  async fetchTimeKey(cgi: string, param: string, viewMode: string) {
    return this.xml(
      `${cgi}?${query([
        ['mode', MODE_TIME_KEY],
        ['reqtype', '1'],
        ['vm', viewMode],
        ['param', param],
      ])}`,
    );
  }

  async fetchComicPages(cgi: string, param: string, trial: string | undefined): Promise<Page[]> {
    let viewMode = VIEW_MODE_HYBRID;
    let timeKey = await this.fetchTimeKey(cgi, param, viewMode);
    // Some webtoons only open in the vertical view mode.
    if (timeKey.selectFirst('Code')?.text() === CODE_VIEW_MODE_ERROR) {
      viewMode = VIEW_MODE_VERTICAL;
      timeKey = await this.fetchTimeKey(cgi, param, viewMode);
    }
    if (timeKey.selectFirst('Code')?.text() !== CODE_SUCCESS) throw new Error(`Viewer error: ${timeKey.text()}`);
    const key = timeKey.selectFirst('Content')!.text();

    const face = await this.xml(this.fileUrl(cgi, MODE_FACE_XML, 'face.xml', viewMode, key));
    const totalPages = Number.parseInt(face.selectFirst('TotalPage')?.text() ?? '', 10);
    const gridWidth = face.selectFirst('Scramble > Width')?.text();
    const gridHeight = face.selectFirst('Scramble > Height')?.text();
    if (Number.isNaN(totalPages) || !gridWidth || !gridHeight) throw new Error(`Viewer error: ${face.text()}`);

    let first = 0;
    let end = totalPages;
    const range = trial?.split('_');
    if (range?.length === 2) {
      first = Number.parseInt(range[0]!, 10);
      end = Number.parseInt(range[1]!, 10) + 1;
    }

    // Omf books store two pages per sheet, the others list single pages like covers or webtoon slices.
    const spreads = new Set<number>();
    if ((face.selectFirst('OptionId')?.text() ?? '').includes('Omf')) {
      for (const n of (face.selectFirst('DoublePagesMap')?.text() ?? '').split(',')) {
        const value = Number.parseInt(n.trim(), 10);
        if (!Number.isNaN(value)) spreads.add(value);
      }
    }
    // Right-to-left books (binding 0) start with the right half.
    const halves = face.selectFirst('Binding')?.text() === '1' ? [HALF_LEFT, HALF_RIGHT] : [HALF_RIGHT, HALF_LEFT];
    const fragment = `${PAGE_FRAGMENT},${gridWidth},${gridHeight}`;

    const urls: string[] = [];
    for (let pageNumber = first; pageNumber < end; pageNumber++) {
      const pageUrl = this.fileUrl(cgi, MODE_PAGE_XML, `${String(pageNumber).padStart(4, '0')}.xml`, viewMode, key);
      if (spreads.has(pageNumber)) for (const half of halves) urls.push(`${pageUrl}#${fragment},${half}`);
      else urls.push(`${pageUrl}#${fragment}`);
    }
    return urls.map((imageUrl, index): Page => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  async transformImage(page: Page, bytes: Uint8Array): Promise<ImageTransform> {
    const url = page.imageUrl ?? '';
    const [pageUrl = '', fragment = ''] = url.split('#');
    if (!fragment.startsWith(`${PAGE_FRAGMENT},`)) return {};
    const params = fragment.split(',');
    const gridWidth = Number.parseInt(params[1]!, 10);
    const gridHeight = Number.parseInt(params[2]!, 10);
    const half = params[3];

    const xml = html.load(utf8.decode(Array.from(bytes)), { xml: true });
    // An error such as "trial page over" comes back as a <Result> instead of a <Page>.
    const pageNumber = xml.selectFirst('PageNo')?.text();
    if (!pageNumber) throw new Error(`Viewer error: ${xml.text()}`);
    const part = xml.select('Kind').find((k) => IMAGE_KINDS.includes(k.text()));
    if (!part) throw new Error('Viewer error: the page has no image');

    const file = `${pageNumber.padStart(4, '0')}_${(part.attr('No') ?? '').padStart(4, '0')}.bin`;
    const imageUrl = pageUrl
      .replace(/([?&])mode=[^&]*/, `$1mode=${part.text()}`)
      .replace(/([?&])file=[^&]*/, `$1file=${encodeURIComponent(file)}`);
    const response = await http.get<string>(imageUrl, { headers: this.headers(), responseType: 'bytes' });
    const image = base64.decodeBytes(response.body);

    const isScrambled = part.attr('scramble') === '1';
    if (!isScrambled && half === undefined) return { bytes: image };
    const size = imageSize(image);
    if (!size) return { bytes: image };
    const mapping = isScrambled
      ? (xml.selectFirst('Scramble')?.text() ?? '').split(',').map((n) => Number.parseInt(n, 10))
      : [];
    return { bytes: image, tiles: this.unscramble(size[0], size[1], mapping, gridWidth, gridHeight, half) };
  }

  unscramble(
    width: number,
    height: number,
    mapping: number[],
    gridWidth: number,
    gridHeight: number,
    half: string | undefined,
  ): { width: number; height: number; ops: TileOp[] } {
    const left = half === HALF_RIGHT ? Math.floor(width / 2) : 0;
    const right = half === HALF_LEFT ? Math.floor(width / 2) : width;
    const pieceWidth = Math.floor(Math.floor(width / gridWidth) / 8) * 8;
    const pieceHeight = Math.floor(Math.floor(height / gridHeight) / 8) * 8;

    const rects: TileOp[] = [];
    if (mapping.length === 0 || pieceWidth === 0 || pieceHeight === 0) {
      rects.push({ sx: 0, sy: 0, w: width, h: height, dx: 0, dy: 0 });
    } else {
      mapping.forEach((piece, i) => {
        rects.push({
          sx: (piece % gridWidth) * pieceWidth,
          sy: Math.floor(piece / gridWidth) * pieceHeight,
          w: pieceWidth,
          h: pieceHeight,
          dx: (i % gridWidth) * pieceWidth,
          dy: Math.floor(i / gridWidth) * pieceHeight,
        });
      });
      const gridRight = pieceWidth * gridWidth;
      const gridBottom = pieceHeight * gridHeight;
      if (gridRight < width)
        rects.push({ sx: gridRight, sy: 0, w: width - gridRight, h: height, dx: gridRight, dy: 0 });
      if (gridBottom < height)
        rects.push({ sx: 0, sy: gridBottom, w: gridRight, h: height - gridBottom, dx: 0, dy: gridBottom });
    }
    // Keep the part of every rectangle that lies in [left, right), moved to the left edge.
    const ops: TileOp[] = [];
    for (const r of rects) {
      const from = Math.max(r.dx, left);
      const to = Math.min(r.dx + r.w, right);
      if (to <= from) continue;
      ops.push({ sx: r.sx + (from - r.dx), sy: r.sy, w: to - from, h: r.h, dx: from - left, dy: r.dy });
    }
    return { width: right - left, height, ops };
  }
}

export type { Chapter, MangaDetails, MangaPage, MangaSummary };
