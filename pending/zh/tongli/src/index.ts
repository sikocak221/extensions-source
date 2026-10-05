import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://ebook.tongli.com.tw';
const API_URL = 'https://api.tongli.tw';
const API_KEY = 'AIzaSyAJbYmo7KyhM_7CDXjjFXnp8bdRTNgbUIE';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const EMAIL: Preference = {
  type: 'text',
  key: 'EMAIL',
  label: '电子邮件',
  description: '该配置被修改后，会清空令牌(Token)以便重新登录；如果登录失败，请清空该配置',
  default: '',
};
const PASSWORD: Preference = {
  type: 'text',
  key: 'PASSWORD',
  label: '密码',
  description: '该配置被修改后，会清空令牌(Token)以便重新登录；如果登录失败，请清空该配置',
  default: '',
};

interface TokenResponse {
  idToken?: string;
  id_token?: string;
  refreshToken?: string;
  refresh_token?: string;
}

interface Session {
  token: string;
  refreshToken: string;
  /** Epoch ms; tokens last one hour. */
  expires: number;
  /** The credentials the token was issued for ("" = anonymous). */
  login: string;
}

async function tokenRequest(url: string, body: unknown): Promise<Session> {
  const response = await http.request<TokenResponse>({
    url,
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json;charset=UTF-8' },
    body: { json: body },
    responseType: 'json',
  });
  const token = response.body.idToken ?? response.body.id_token;
  const refreshToken = response.body.refreshToken ?? response.body.refresh_token;
  if (!token || !refreshToken) throw new Error('登录失败');
  return { token, refreshToken, expires: Date.now() + 3_600_000, login: '' };
}

async function getToken(): Promise<string> {
  const email = prefs.get<string>(EMAIL.key) ?? '';
  const password = prefs.get<string>(PASSWORD.key) ?? '';
  const login = email ? `${email}\n${password}` : '';
  let session = await storage.get<Session>('session');
  if (session && session.login === login && session.expires > Date.now()) return session.token;
  if (session && session.login === login && session.refreshToken) {
    try {
      session = {
        ...(await tokenRequest(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
        })),
        login,
      };
      await storage.set('session', session);
      return session.token;
    } catch (error) {
      log.warn('Token refresh failed', error);
    }
  }
  session = {
    ...(email
      ? await tokenRequest(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${API_KEY}`, {
          email,
          password,
          returnSecureToken: true,
        })
      : await tokenRequest(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser?key=${API_KEY}`, {
          returnSecureToken: true,
        })),
    login,
  };
  await storage.set('session', session);
  return session.token;
}

async function api<T>(path: string, auth = false): Promise<T> {
  const requestHeaders = auth ? { ...headers, Authorization: `Bearer ${await getToken()}` } : headers;
  return (await http.get<T>(`${API_URL}${path}`, { headers: requestHeaders, responseType: 'json' })).body;
}

interface MangaDto {
  BookTitle?: string;
  Title?: string;
  BookCoverURL?: string;
  CoverURL?: string;
  BookGroupID: string;
  IsSerial: boolean;
}

const summary = (m: MangaDto): MangaSummary => ({
  url: `/${m.BookGroupID},${m.IsSerial}`,
  title: (m.BookTitle ?? m.Title) as string,
  thumbnailUrl: m.BookCoverURL ?? m.CoverURL,
});

const parts = (url: string): [string, string] => {
  const [id = '', serial = ''] = url.replace(/^\/+/, '').split(',');
  return [id, serial];
};

export default defineExtension({
  preferences: () => [EMAIL, PASSWORD],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const result = await api<{ RankingSet: { Week: MangaDto[] }[] }>('/SellRanking/1');
      return { items: (result.RankingSet[0]?.Week ?? []).map(summary), hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      const result = await api<{ TotalPage: number; Page: number; Books: MangaDto[] }>(
        `/SellShelf/6e7e5b75-1acd-4b7c-0097-08d6179fc10a/${page}?pageSize=20`,
      );
      return { items: result.Books.map(summary), hasNextPage: result.TotalPage > result.Page };
    },
    async search(query): Promise<MangaPage> {
      const response = await http.post<MangaDto[]>(
        `${API_URL}/Search`,
        { form: { SearchStr: query } },
        { headers, responseType: 'json' },
      );
      return { items: response.body.map(summary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const [id, serial] = parts(manga.url);
      const data = await api<{
        Title: string;
        CoverURL: string;
        Authors: { Name: string; Title?: string | null }[];
        Introduction: string;
      }>(`/Book?bookGroupID=${id}&isSerial=${serial}`);
      return {
        url: manga.url,
        title: data.Title,
        thumbnailUrl: data.CoverURL,
        author: data.Authors.map((a) => (a.Title ? `${a.Title}：${a.Name}` : a.Name)).join(', '),
        description: data.Introduction,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const [id, serial] = parts(manga.url);
      const list = await api<
        { BookID: string; Vol: string; IsUpcoming: boolean; IsPurchased: boolean; IsFree: boolean }[]
      >(`/Book/BookVol/${id}?bookID=null&isSerial=${serial}`, true);
      return list
        .filter((c) => !c.IsUpcoming)
        .map((c) => ({ url: `/${c.BookID}`, name: c.IsFree || c.IsPurchased ? c.Vol : `🔒 ${c.Vol}` }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await api<{ Pages: { ImageURL: string }[] }>(
        `/Comic/sas/${chapter.url.replace(/^\/+/, '')}`,
        true,
      );
      return result.Pages.map((p, index) => ({ index, imageUrl: p.ImageURL }));
    },
    imageHeaders: () => headers,
    getWebUrl(item) {
      const [id, serial] = parts(item.url);
      return `${BASE_URL}/book?id=${id}&isGroup=true&isSerials=${serial}`;
    },
  }),
});
