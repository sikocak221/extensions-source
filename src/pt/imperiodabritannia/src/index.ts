import { defineExtension } from '@matane/extension-sdk';
import { MangoTheme, type Option, type TagOption } from './mangotheme/MangoTheme';

const STATUS: Option[] = [
  ['Todos', ''],
  ['Ativo', '6'],
  ['Cancelado', '4'],
  ['Concluído', '3'],
  ['Em Andamento', '1'],
  ['Hiato', '5'],
  ['Pausado', '2'],
];

const FORMAT: Option[] = [
  ['Todos', ''],
  ['Comic', '20'],
  ['Hentai', '23'],
  ['Manga', '24'],
  ['Manhua', '17'],
  ['Manhwa', '25'],
  ['Novel', '18'],
  ['Shoujo', '19'],
  ['Webtoon', '26'],
  ['Yaoi', '21'],
  ['Yuri', '22'],
];

const TAGS: TagOption[] = [
  { name: '+18', id: '48' },
  { name: 'Ação', id: '2' },
  { name: 'Adaptação', id: '108' },
  { name: 'Adulto', id: '64' },
  { name: 'Alienígenas', id: '96' },
  { name: 'Apocalipse', id: '33' },
  { name: 'Apocalíptico', id: '58' },
  { name: 'Artes Marciais', id: '24' },
  { name: 'Aventura', id: '3' },
  { name: 'Bullying', id: '60' },
  { name: 'c', id: '65' },
  { name: 'Comédia', id: '6' },
  { name: 'Crime', id: '51' },
  { name: 'Culinaria', id: '28' },
  { name: 'Culinária', id: '112' },
  { name: 'Cultivo', id: '23' },
  { name: 'Delinquente', id: '91' },
  { name: 'Demônios', id: '114' },
  { name: 'Demônios', id: '39' },
  { name: 'Doujin', id: '9' },
  { name: 'Dragon lan scan', id: '101' },
  { name: 'Drama', id: '92' },
  { name: 'Dungeon', id: '25' },
  { name: 'Ecchi', id: '42' },
  { name: 'Escolar', id: '56' },
  { name: 'Esportes', id: '38' },
  { name: 'Fantasia', id: '4' },
  { name: 'Fatia da Vida/Slice of Life', id: '41' },
  { name: 'Ficção Científica', id: '40' },
  { name: 'Finalizado', id: '55' },
  { name: 'Full Collor', id: '97' },
  { name: 'Full Color', id: '93' },
  { name: 'Garota Monstro', id: '68' },
  { name: 'Garota Monstro.', id: '98' },
  { name: 'Garotas Mágicas', id: '69' },
  { name: 'Gender Bender', id: '70' },
  { name: 'Genderswap', id: '71' },
  { name: 'Girl Love', id: '72' },
  { name: 'Gore', id: '59' },
  { name: 'Gore scan', id: '111' },
  { name: 'Harém', id: '44' },
  { name: 'Hentai', id: '73' },
  { name: 'Herói', id: '74' },
  { name: 'Histórico', id: '11' },
  { name: 'Horror', id: '75' },
  { name: 'Isekai', id: '19' },
  { name: 'Jogo', id: '46' },
  { name: 'Jogos', id: '95' },
  { name: 'Josei', id: '17' },
  { name: 'Loli', id: '5' },
  { name: 'Luta', id: '35' },
  { name: 'máfia', id: '36' },
  { name: 'Magia', id: '29' },
  { name: 'Manga', id: '8' },
  { name: 'Mangá', id: '99' },
  { name: 'manhua', id: '45' },
  { name: 'Manhua', id: '7' },
  { name: 'Manhwa', id: '76' },
  { name: 'Mecha', id: '77' },
  { name: 'Medíocre', id: '105' },
  { name: 'Mediocre scan', id: '107' },
  { name: 'Medíocre scan', id: '103' },
  { name: 'Militar', id: '14' },
  { name: 'Mistério', id: '43' },
  { name: 'Moderno', id: '54' },
  { name: 'Monstro', id: '100' },
  { name: 'Monstros', id: '37' },
  { name: 'Murim', id: '31' },
  { name: 'Música', id: '78' },
  { name: 'Necromante', id: '32' },
  { name: 'Norte scan', id: '113' },
  { name: 'One-shot', id: '18' },
  { name: 'Oneshot', id: '49' },
  { name: 'One Shot', id: '110' },
  { name: 'Policial', id: '52' },
  { name: 'Pós Apocalíptico', id: '94' },
  { name: 'Psicológico', id: '27' },
  { name: 'Realidade Virtua', id: '67' },
  { name: 'Realidade Virtual', id: '106' },
  { name: 'Reencarnação', id: '21' },
  { name: 'Regressão', id: '47' },
  { name: 'Retorno', id: '20' },
  { name: 'Romance', id: '79' },
  { name: 'Sagrado império da britannia', id: '117' },
  { name: 'Samurai', id: '80' },
  { name: 'Sci-Fi', id: '62' },
  { name: 'Seinen', id: '34' },
  { name: 'Sempre ao seu lado scan', id: '109' },
  { name: 'Shoujo', id: '16' },
  { name: 'Shoujo Ai', id: '81' },
  { name: 'Shounen', id: '15' },
  { name: 'Shounen Ai', id: '63' },
  { name: 'Sistema', id: '22' },
  { name: 'Skarla scan', id: '116' },
  { name: 'Slice of Life', id: '61' },
  { name: 'Sobrenatural', id: '13' },
  { name: 'Sobrevivência', id: '82' },
  { name: 'SuperPoder', id: '30' },
  { name: 'Super Poderes', id: '57' },
  { name: 'Suspense', id: '10' },
  { name: 'Terror', id: '83' },
  { name: 'teste', id: '1' },
  { name: 'Teste99', id: '66' },
  { name: 'Thriller', id: '84' },
  { name: 'Tragédia', id: '26' },
  { name: 'Updating', id: '102' },
  { name: 'Verdinha', id: '104' },
  { name: 'Viagem no Tempo', id: '53' },
  { name: 'Vida escolar', id: '12' },
  { name: 'Video Game', id: '85' },
  { name: 'Vingança', id: '86' },
  { name: 'Web Comic', id: '87' },
  { name: 'Webtoon', id: '88' },
  { name: 'Wuxia', id: '89' },
  { name: 'Xianxia', id: '90' },
  { name: 'Yuri', id: '50' },
  { name: 'Zero scan', id: '115' },
];

class ImperioDaBritannia extends MangoTheme {
  readonly name = 'Sagrado Império da Britannia';
  readonly baseUrl = 'https://imperiodabritannia.net';

  override webMangaPathSegment = 'manga';

  override get cdnUrl(): string {
    return 'https://cdn.imperiodabritannia.net';
  }

  override get apiUrl(): string {
    return `https://api.${this.baseUrl.replace(/^https?:\/\//, '')}/api`;
  }

  private token: string | undefined;

  // The api token is published in the site's env script.
  private async apiToken(): Promise<string> {
    if (this.token !== undefined) return this.token;
    let token = '';
    try {
      const home = html.load((await http.get(this.baseUrl, { headers: { 'User-Agent': this.userAgent } })).body, {
        baseUrl: this.baseUrl,
      });
      const script = home.selectFirst('link[href*=env]')?.absUrl('href');
      if (script) {
        const body = (await http.get(script, { headers: { 'User-Agent': this.userAgent } })).body;
        token = /apiToken:.([^`]+)/.exec(body)?.[1] ?? '';
      }
    } catch {
      // The api answers without a token as well.
    }
    this.token = token;
    return token;
  }

  override async requestHeaders(): Promise<Record<string, string>> {
    return {
      ...(await super.requestHeaders()),
      'X-API-Token': await this.apiToken(),
      'X-Brit-Cache': 'true',
      'X-Noencryptionbritta': '1',
    };
  }

  getStatusFilterOptions(): Option[] {
    return STATUS;
  }

  getFormatFilterOptions(): Option[] {
    return FORMAT;
  }

  getTagFilterOptions(): TagOption[] {
    return TAGS;
  }
}

export default defineExtension({
  createSource: () => new ImperioDaBritannia().toSource(),
});
