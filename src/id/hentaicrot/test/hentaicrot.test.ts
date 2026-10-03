import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type FixtureHost, buildExtension, createFixtureHost, hasFixtures } from '@matane/extension-cli';
import { ExtensionRuntime } from '@matane/extension-runtime';
import type { Chapter, Filter, MangaDetails, MangaPage, MangaSummary, Page } from '@matane/extension-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Generic reading-flow test (scripts/templates/extension.test.ts): the manga under test is the first
// popular one, so recording fixtures needs no hand-picked urls.
const NAME = 'Hentai Crot';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(root, 'test/fixtures');
const RECORD = process.env.MR_RECORD === '1';
const enabled = RECORD || hasFixtures(FIXTURES);
const suite = enabled ? describe : describe.skip;
if (!enabled)
  console.warn(`${NAME} tests skipped: no fixtures in ${FIXTURES} (record them with MR_RECORD=1 pnpm test)`);

let host: FixtureHost;
let runtime: ExtensionRuntime;
let manga: MangaSummary;
let chapters: Chapter[];
let sourceKey = '';

const call = <T>(method: string, args: unknown[] = []) => runtime.call<T>(sourceKey, method, args, { prefs: {} });

beforeAll(async () => {
  if (!enabled) return;
  const { code, manifest } = await buildExtension(root, { write: false });
  sourceKey = manifest.sources[0]!.key;
  host = createFixtureHost({ dir: FIXTURES, record: RECORD });
  runtime = await ExtensionRuntime.create({
    code,
    manifest,
    host,
    hostInfo: { appName: 'Matane', appVersion: '0.0.0-test', apiVersion: 1 },
  });
}, 30_000);

afterAll(() => runtime?.dispose());

suite(NAME, { timeout: 60_000 }, () => {
  it('getPopular lists manga', async () => {
    const page = await call<MangaPage>('getPopular', [1]);
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.url).toMatch(/^\//);
      expect(item.title).not.toBe('');
    }
    manga = page.items[0]!;
  });

  it('getLatest lists manga', async () => {
    const page = await call<MangaPage | null>('getLatest', [1]).catch(() => null);
    if (page) expect(page.items.length).toBeGreaterThan(0);
  });

  it('getFilters and search', async () => {
    const filters = await call<Filter[]>('getFilters').catch(() => []); // getFilters is optional
    expect(Array.isArray(filters)).toBe(true);
    // Sites match titles differently: try a few queries made from the title, first match wins.
    const words = manga.title
      .split(/\s+/)
      .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter((w) => w.length > 1);
    const plain = manga.title.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
    const queries = [
      ...new Set(
        [words.slice(0, 2).join(' '), plain.slice(0, 2).join(' '), words[0] ?? '', manga.title].filter(Boolean),
      ),
    ];
    let found = 0;
    for (const query of queries) {
      found = (await call<MangaPage>('search', [query, 1, {}])).items.length;
      if (found > 0) break;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('getMangaDetails', async () => {
    const details = await call<MangaDetails>('getMangaDetails', [manga]);
    expect(details.url).toBe(manga.url);
    expect(details.title).not.toBe('');
    expect(['ongoing', 'completed', 'hiatus', 'cancelled', 'unknown']).toContain(details.status);
  });

  it('getChapters', async () => {
    chapters = await call<Chapter[]>('getChapters', [manga]);
    expect(chapters.length).toBeGreaterThan(0);
    for (const chapter of chapters) {
      expect(chapter.url).not.toBe('');
      expect(chapter.name).not.toBe('');
    }
  });

  it('getPages', async () => {
    const pages = await call<Page[]>('getPages', [chapters[chapters.length - 1]]);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]?.index).toBe(0);
    expect(pages[0]?.imageUrl ?? pages[0]?.url).toMatch(/^https?:\/\//);
  });

  it('resolveUrl round-trips getWebUrl', async () => {
    const web = await call<string>('getWebUrl', [manga]);
    expect(web).toMatch(/^https?:\/\//);
    const resolved = await call<MangaSummary | null>('resolveUrl', [web]).catch(() => undefined);
    if (resolved !== undefined) expect(resolved?.url).toBe(manga.url);
  });
});
