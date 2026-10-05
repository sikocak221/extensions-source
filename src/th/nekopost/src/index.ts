import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';
import { md5Bytes } from './md5';

const BASE_URL = 'https://www.nekopost.net';
const POPULAR_PAGE_SIZE = 15;
const LATEST_PAGE_SIZE = 15;
const SEARCH_PAGE_SIZE = 100;
/** Passphrase the site's client bundle uses to decrypt the `handler/cinfo` response. */
const CIPHER_PASSPHRASE = 'AeyTest';
const WWW_FILE_HOST = 'https://www.osemocphoto.com';
const FS_FILE_HOST = 'https://fs.osemocphoto.com';
/** Project ids above this are served from FS_FILE_HOST, the rest from WWW_FILE_HOST. */
const FILE_HOST_THRESHOLD = 17500;

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: '*/*' };

interface ProjectSummary {
  pid: number;
  projectName: string;
  coverVersion?: number | null;
}

interface ProjectInfo {
  projectInfo?: {
    Project: {
      pid: number;
      projectName: string;
      authorName?: string;
      artistName?: string;
      info?: string;
      status: number;
    };
    ListCate?: { CateName: string }[] | null;
    ListChapter?:
      | {
          ChapterID: number;
          ChapterNo: string;
          ChapterName: string;
          PublishDate?: { String?: string };
          ProviderName?: string;
        }[]
      | null;
  } | null;
}

/** The site splits its files across two hosts by project id; the wrong host answers with a placeholder. */
const fileHost = (projectId: number) => (projectId > FILE_HOST_THRESHOLD ? FS_FILE_HOST : WWW_FILE_HOST);

function coverUrl(projectId: number, coverVersion?: number | null): string {
  const base = `${fileHost(projectId)}/collectManga/${projectId}/${projectId}_cover.jpg`;
  return coverVersion != null ? `${base}?ver=${coverVersion}` : base;
}

function toStatus(status: number): MangaStatus {
  return status === 1 ? 'ongoing' : status === 2 ? 'completed' : 'unknown';
}

async function post<T>(path: string, body: unknown, responseType: 'json' | 'text' = 'json'): Promise<T> {
  const response = await http.request<T>({
    url: `${BASE_URL}${path}`,
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: { json: body },
    responseType,
  });
  return response.body;
}

function summary(project: ProjectSummary): MangaSummary {
  return {
    url: `/${project.pid}`,
    title: project.projectName,
    thumbnailUrl: coverUrl(project.pid, project.coverVersion),
  };
}

const idOf = (url: string) => Number.parseInt(url.replace(/^\/+/, '').split('/')[0] ?? '', 10);

async function fetchProject(manga: MangaSummary): Promise<NonNullable<ProjectInfo['projectInfo']>> {
  const info = (await post<ProjectInfo>('/api/project/detail2', { pid: idOf(manga.url) })).projectInfo;
  if (!info) throw new Error('Project not found');
  return info;
}

/** CryptoJS-style AES ("Salted__" + salt + data, OpenSSL EVP_BytesToKey with MD5). */
function decrypt(payload: string, password: string): string {
  const bytes = base64.decodeBytes(payload.trim());
  const salt = [...bytes.subarray(8, 16)];
  const pass = utf8.encode(password);
  let keyAndIv: number[] = [];
  let previous: number[] = [];
  while (keyAndIv.length < 48) {
    previous = md5Bytes([...previous, ...pass, ...salt]);
    keyAndIv = keyAndIv.concat(previous);
  }
  const plain = crypto.aesDecrypt(bytes.subarray(16), keyAndIv.slice(0, 32), {
    mode: 'cbc',
    iv: keyAndIv.slice(32, 48),
  });
  return utf8.decode([...plain]);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const result = await post<{ listProject?: ProjectSummary[] | null }>('/api/project/list/popular', {
        type: 'mc',
        paging: { pageNo: 1, pageSize: POPULAR_PAGE_SIZE },
      });
      return { items: (result.listProject ?? []).map(summary), hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      const result = await post<{ listChapter?: ProjectSummary[] | null }>('/api/project/latest', {
        type: 'm',
        paging: { pageNo: page, pageSize: LATEST_PAGE_SIZE },
      });
      const items = (result.listChapter ?? []).map(summary);
      return { items, hasNextPage: items.length === LATEST_PAGE_SIZE };
    },
    async search(query, page): Promise<MangaPage> {
      const result = await post<{ listProject?: (ProjectSummary & { projectType: string })[] | null }>(
        '/api/project/search',
        { keyword: query.trim(), status: 0, paging: { pageNo: page, pageSize: SEARCH_PAGE_SIZE } },
      );
      const items = (result.listProject ?? []).filter((p) => p.projectType === 'm').map(summary);
      return { items, hasNextPage: items.length === SEARCH_PAGE_SIZE };
    },
    async getMangaDetails(manga): Promise<MangaDetails> {
      const info = await fetchProject(manga);
      const project = info.Project;
      return {
        url: `/${project.pid}`,
        title: project.projectName,
        author: project.authorName || undefined,
        artist: project.artistName || undefined,
        description: project.info || undefined,
        status: toStatus(project.status),
        thumbnailUrl: coverUrl(project.pid),
        genres: (info.ListCate ?? []).map((c) => c.CateName),
      };
    },
    async getChapters(manga): Promise<Chapter[]> {
      const info = await fetchProject(manga);
      if (info.Project.status === 3) throw new Error('Licensed');
      const projectId = info.Project.pid;
      return (info.ListChapter ?? []).map((chapter) => {
        const date = Date.parse(chapter.PublishDate?.String ?? '');
        return {
          url: `/${projectId}/${chapter.ChapterID}`,
          name: chapter.ChapterName,
          number: Number.parseFloat(chapter.ChapterNo),
          scanlator: chapter.ProviderName || undefined,
          uploadedAt: Number.isNaN(date) ? undefined : date,
        };
      });
    },
    async getPages(chapter): Promise<Page[]> {
      const [project, chapterId] = chapter.url.split('/').filter(Boolean).map(Number);
      const body = await post<string>('/handler/cinfo', { p: project, c: chapterId }, 'text');
      const decrypted = decrypt(body, CIPHER_PASSPHRASE);
      if (!decrypted) throw new Error('Failed to decrypt chapter data');
      const info = JSON.parse(decrypted) as {
        chapterId: string;
        projectId: string;
        pageItem: { pageName?: string | null; fileName?: string | null; pageNo: string }[];
      };
      const base = `${fileHost(Number(info.projectId))}/collectManga/${info.projectId}/${info.chapterId}`;
      // The site's own reader sorts by pageNo rather than trusting the returned order.
      return [...info.pageItem]
        .sort((a, b) => Number(a.pageNo) - Number(b.pageNo))
        .map((item, index) => ({ index, imageUrl: `${base}/${item.pageName ?? item.fileName}` }));
    },
    imageHeaders: () => headers,
    getWebUrl(item) {
      const [project] = item.url.split('/').filter(Boolean);
      const number = 'number' in item && item.number !== undefined ? `/${String(item.number).replace(/\.0$/, '')}` : '';
      return `${BASE_URL}/manga/${project}${number}`;
    },
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/manga\/(\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: `/${match[2]}`, title: '' };
    },
  }),
});
