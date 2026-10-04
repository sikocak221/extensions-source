# Porting Tachiyomi → Matane

Checkpoint for porting [keiyoushi/extensions-source](https://github.com/keiyoushi/extensions-source) to Matane.
Language `id` is complete (every row is `done`, `ported` in `pending/`, or `blocked`). Language `en`: every theme with a
live site is ported (themes marked `later` only had blocked sites); next are the standalone `en` rows. Resume from the first `todo` row. Update the row (and commit) after every extension.

## Conventions

- Layout mirrors Tachiyomi: `src/<lang>/<id>/` (multi-language sites in `src/all/`), themes in `lib-multisrc/<theme>/`.
- `lib-multisrc/<theme>/src/` is the theme ported once from Tachiyomi's Kotlin, as an abstract class (same member
  names as Kotlin). Each extension keeps an **identical copy** in `src/<theme>/` and overrides members in a subclass
  in `src/index.ts`. Edit the template, then `node scripts/sync-multisrc.mjs` (CI runs it with `--check`).
- id = lowercase Tachiyomi folder name (never changes); new extensions start at `1.0.0`, existing ones bump.
- `ContentWarning.NSFW` → `nsfw: true` (MIXED → false). Icon from `res/mipmap-xxxhdpi/ic_launcher.png`.
- Every extension has `test/<id>.test.ts` (copy of `scripts/templates/extension.test.ts`): first popular manga →
  details → chapters → pages of the **oldest** chapter (newest ones are often locked).
  Fixtures drop response headers, so the template keeps `Set-Cookie` and `Date` in side files (`set-cookie.json`,
  `date.json`); sources that sign requests with the time take it from a `Date` header (see MangaTaro), never `Date.now()`.
- Manifests have no `domains` allowlist any more (dropped in SDK 0.2.0, manga-reader ADR 0031): extensions may reach any
  http(s) host, like Tachiyomi's.
- Shared helpers: `lib-multisrc/common/src/utils.ts` is copied into a theme's `src/utils.ts` by the sync script (newer
  themes use it); standalone extensions get it with `--theme common` (`src/common/utils.ts`).
- The sandbox has no `URL`, Jsoup `:contains` is case-insensitive (cheerio's is not: use `selectIgnoreCase`),
  no `ownText()` (use the helper), and code is stopped after 2 s without yielding (yield in long loops).
- Sites dead, behind a Cloudflare challenge, or redesigned since the Tachiyomi version: `blocked` + note, folder removed.

## Workflow (one extension)

```sh
T=../clone-extension/extensions-source/src/id
node scripts/new-extension.mjs --lang id --id foo --name "Foo" --url https://foo.example --theme mangathemesia [--nsfw] --icon $T/foo
pnpm install
# port the Kotlin overrides into src/id/foo/src/index.ts (scripts/set-overrides.py helps)
scripts/record.sh src/id/foo          # records fixtures through public DNS (ISP blocks NSFW sites)
node scripts/fixture.mjs src/id/foo <url-regex> <body-regex>   # inspect recorded pages
node scripts/time-call.mjs src/id/foo getChapters '{"url":"/manga/x/","title":""}'
scripts/live.sh src/id/foo            # mr-ext test against the real site
node scripts/porting.mjs foo done     # update this file; no args lists the next todo rows
```

## Workflow (a new language or a theme batch)

```sh
T=../clone-extension/extensions-source/src
node scripts/tachiyomi-meta.mjs $T en > en.jsonl                       # id, name, baseUrl, nsfw, theme, Kotlin size
node --import ./scripts/public-dns.mjs scripts/probe-sites.mjs < en.jsonl > en-probe.jsonl   # which sites answer
python3 scripts/batch-theme.py en.jsonl $T en "id1 id2 …"   # scaffold + simple Kotlin overrides; prints what is left
#   (kotlin-overrides.py does the conversion; don't re-add members it already wrote)
scripts/record.sh src/en/id1 …; scripts/live.sh src/en/id1 …
scripts/check.sh                                            # everything CI checks; fails on the first problem
```

Status: `todo` → `ported` (code + build) → `done` (fixture test + live `mr-ext test` pass) · `blocked` · `later` (theme whose sites are all blocked).

## Themes (lib-multisrc)

| Theme         | Extensions (id) | Status  |
| ------------- | --------------- | ------- |
| mangathemesia | 29              | done    |
| zeistmanga    | 9               | done    |
| madara        | 5               | done    |
| loneseal      | 5               | done    |
| zmanga        | 3               | done    |
| natsuid       | 3               | done    |
| oceanwp       | 2               | done    |
| hwalumi       | 2               | done    |
| colorlibanime | 2               | ported  |
| keyoapp       | 16 (en)         | done    |
| mangacatalog  | 12 (en)         | done    |
| mangahub      | 11 (en)         | ported  |
| iken          | 10 (en)         | done    |
| vinetheme     | 5 (en)          | done    |
| guya          | 3 (en)          | done    |
| manga18       | 3 (en)          | done    |
| mangabox      | 3 (en)          | done    |
| mangadventure | 2 (en)          | done    |
| bakkin        | 2 (en)          | done    |
| foolslide     | 2 (en)          | done    |
| eromuse       | 2 (en)          | done    |
| ezmanhwa      | 2 (en)          | done    |
| heancms       | 2 (en)          | done    |
| mangak        | 2 (en)          | done    |
| mangataro     | 2 (en)          | done    |
| manhwaz       | 2 (en)          | later   | every en site blocked; port with a language that has live sites |
| monochrome    | 2 (en)          | done    |
| goda          | 1 (en)          | ported  |
| hiper         | 1 (en)          | done    |
| singleseries  | Matane helper   | done    | one-series sites (webcomics); not a Tachiyomi theme             |
| initmanga     | 1 (en)          | done    |
| mangareader   | 1 (en)          | done    |
| liliana       | 1 (en)          | done    |
| mmrcms        | 1 (en)          | later   | every en site blocked; port with a language that has live sites |
| pam           | 1 (en)          | later   | every en site blocked; port with a language that has live sites |
| madaralegacy  | 1 (en)          | blocked |
| wpcomics      | 1 (en)          | done    |

## id

| Extension        | Theme         | Status  | Notes                                                                                                                                                       |
| ---------------- | ------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| komikzoid        | colorlibanime | blocked | Cloudflare challenge                                                                                                                                        |
| sektekomik       | colorlibanime | blocked | Cloudflare challenge                                                                                                                                        |
| hwago            | hwalumi       | done    |                                                                                                                                                             |
| lumoskomik       | hwalumi       | done    |                                                                                                                                                             |
| ainzscansid      | loneseal      | done    | refactored onto loneseal (1.1.0)                                                                                                                            |
| dreamteamsscans  | loneseal      | done    |                                                                                                                                                             |
| mangakuri        | loneseal      | blocked | every chapter needs a login (Bearer token from the site's localStorage); could take a token preference                                                      |
| roseveil         | loneseal      | done    |                                                                                                                                                             |
| soulscans        | loneseal      | done    |                                                                                                                                                             |
| kaguya           | madara        | blocked | Cloudflare challenge                                                                                                                                        |
| klikmanga        | madara        | done    |                                                                                                                                                             |
| mgkomik          | madara        | blocked | Cloudflare challenge                                                                                                                                        |
| otascans         | madara        | done    |                                                                                                                                                             |
| siimanga         | madara        | done    |                                                                                                                                                             |
| astralscans      | mangathemesia | done    | new ASX_ chapter-list obfuscation                                                                                                                           |
| dailysuka        | mangathemesia | blocked | domain has no DNS record (dead)                                                                                                                             |
| dojingnet        | mangathemesia | done    |                                                                                                                                                             |
| doujinku         | mangathemesia | done    |                                                                                                                                                             |
| izanamiscans     | mangathemesia | done    |                                                                                                                                                             |
| kanzenin         | mangathemesia | done    |                                                                                                                                                             |
| komikav          | mangathemesia | done    |                                                                                                                                                             |
| komikdewasa      | mangathemesia | done    |                                                                                                                                                             |
| komikdewasaart   | mangathemesia | blocked | Cloudflare 403 for Node fetch (curl OK); retry in app                                                                                                       |
| komikindo        | mangathemesia | done    | moved to 1.komikindo.shop                                                                                                                                   |
| komikstation     | mangathemesia | blocked | Cloudflare challenge                                                                                                                                        |
| komiktap         | mangathemesia | done    |                                                                                                                                                             |
| kumapoi          | mangathemesia | done    |                                                                                                                                                             |
| kuromanga        | mangathemesia | done    |                                                                                                                                                             |
| lianscans        | mangathemesia | done    |                                                                                                                                                             |
| luvyaa           | mangathemesia | blocked | Cloudflare challenge                                                                                                                                        |
| mangacan         | mangathemesia | done    | pages in img.ts-main-image                                                                                                                                  |
| mangasusu        | mangathemesia | done    |                                                                                                                                                             |
| manhwadesu       | mangathemesia | done    |                                                                                                                                                             |
| manhwaindo       | mangathemesia | blocked | site redesigned (Tailwind); Tachiyomi source outdated                                                                                                       |
| manhwalandmom    | mangathemesia | blocked | moved to 05c.manhwaland.land, which returns 522                                                                                                             |
| manhwalistid     | mangathemesia | blocked | connection fails (dead?)                                                                                                                                    |
| manhwalistorg    | mangathemesia | done    |                                                                                                                                                             |
| mihentai         | mangathemesia | done    |                                                                                                                                                             |
| ngomik           | mangathemesia | done    |                                                                                                                                                             |
| noromax          | mangathemesia | done    |                                                                                                                                                             |
| omicaso          | mangathemesia | blocked | site redesigned (no MangaThemesia); Tachiyomi source outdated                                                                                               |
| sasangeyou       | mangathemesia | done    |                                                                                                                                                             |
| sektedoujin      | mangathemesia | done    |                                                                                                                                                             |
| ikiru            | natsuid       | blocked | 08.ikiru.wtf → ikiru.id, now a portal page without the manga API                                                                                            |
| kiryuu           | natsuid       | done    | chapter list parsed as text (18 MB html)                                                                                                                    |
| natsu            | natsuid       | done    |                                                                                                                                                             |
| hentaicrot       | oceanwp       | done    |                                                                                                                                                             |
| pixhentai        | oceanwp       | done    |                                                                                                                                                             |
| bacakomik        | standalone    | blocked | site returns 522 (dead)                                                                                                                                     |
| bacami           | standalone    | ported  | in pending/: Cloudflare challenges Node fetch (curl OK)                                                                                                     |
| comicaso         | standalone    | blocked | manga API needs a Google login (Medusa) or a JS challenge (/api/challenge.php, Comicazen)                                                                   |
| cosmicscansid    | standalone    | done    | series with slugs over 100 chars are hidden (API route limit)                                                                                               |
| doujindesu       | standalone    | done    | hourly XOR-encrypted API; fixtures store decrypted JSON                                                                                                     |
| holotoon         | standalone    | ported  | in pending/: chapter pages (/read/) behind a Cloudflare challenge                                                                                           |
| komikindoid      | standalone    | ported  | in pending/: komikindo.ch shows a maintenance page                                                                                                          |
| komiknesia       | standalone    | done    | AES envelope decryption kept (API currently answers plain JSON)                                                                                             |
| komiknextgonline | standalone    | done    |                                                                                                                                                             |
| komiku           | standalone    | done    |                                                                                                                                                             |
| komikucom        | standalone    | done    | mr-ext test: image CDN answers 403 to Node fetch (curl and browsers OK)                                                                                     |
| kumopoi          | standalone    | done    | signed page API (HMAC-SHA256 in JS)                                                                                                                         |
| mangalay         | standalone    | done    | no site search: search filters the catalogue                                                                                                                |
| narasininja      | standalone    | done    | Laravel CSRF + session cookie; test injects the cookie while recording                                                                                      |
| pramramadhan     | standalone    | done    |                                                                                                                                                             |
| riztranslation   | standalone    | done    |                                                                                                                                                             |
| ryukomik         | standalone    | done    |                                                                                                                                                             |
| shinigami        | standalone    | done    |                                                                                                                                                             |
| softkomik        | standalone    | blocked | chapter list and page API need a session from /api/session/* that requires the site's cookies (and its path changes often; Tachiyomi falls back to WebView) |
| themanga         | standalone    | done    |                                                                                                                                                             |
| voratoon         | standalone    | done    | moved to v5.voratoon.com                                                                                                                                    |
| westmanga        | standalone    | done    | existing; same endpoints and request signing as Tachiyomi, no change needed                                                                                 |
| wurmz            | standalone    | done    | data read from the html (ld+json + escaped React payload), no RSC resolver                                                                                  |
| aarlas           | zeistmanga    | done    | refactored onto zeistmanga (1.1.0)                                                                                                                          |
| inazumanga       | zeistmanga    | done    |                                                                                                                                                             |
| lepoytl          | zeistmanga    | done    |                                                                                                                                                             |
| mikoroku         | zeistmanga    | blocked | moved to mikoroku.com, no longer Blogger                                                                                                                    |
| ngamenkomik      | zeistmanga    | done    |                                                                                                                                                             |
| okyykomik        | zeistmanga    | blocked | connection fails (dead?)                                                                                                                                    |
| shiyurasub       | zeistmanga    | done    |                                                                                                                                                             |
| tooncubus        | zeistmanga    | blocked | reader domain tooncubus-read.my.id has no DNS record                                                                                                        |
| ulascomic        | zeistmanga    | blocked | html pages show a 'Rehat sejenak' break page (feeds still work)                                                                                             |
| crotpedia        | zmanga        | done    |                                                                                                                                                             |
| maidmanga        | zmanga        | done    |                                                                                                                                                             |
| shirodoujin      | zmanga        | done    |                                                                                                                                                             |

## en

Status seeded from a site probe (node fetch through public DNS): `blocked` rows can be retried.

| Extension                                 | Theme         | Status  | Notes                                                                                                        |
| ----------------------------------------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| bakkin                                    | bakkin        | done    |                                                                                                              |
| bakkinselfhosted                          | bakkin        | blocked | probe 2026-10-03: dead:ECONNREFUSED                                                                          |
| eightmuses                                | eromuse       | done    |                                                                                                              |
| erofus                                    | eromuse       | done    |                                                                                                              |
| ezmanga                                   | ezmanhwa      | blocked | probe 2026-10-03: http:403                                                                                   |
| qiscans                                   | ezmanhwa      | done    |                                                                                                              |
| deathtollscans                            | foolslide     | done    |                                                                                                              |
| mangatellers                              | foolslide     | done    |                                                                                                              |
| goda                                      | goda          | ported  | template done; site's chapter API challenges Node fetch                                                      |
| dankefurslesen                            | guya          | done    |                                                                                                              |
| guya                                      | guya          | done    |                                                                                                              |
| hachirumi                                 | guya          | done    |                                                                                                              |
| luascans                                  | heancms       | done    |                                                                                                              |
| omegascans                                | heancms       | done    | login preferences (plain text, token kept in memory)                                                         |
| hiperdex                                  | hiper         | done    |                                                                                                              |
| hijalascans                               | iken          | blocked | probe 2026-10-03: http:403                                                                                   |
| hivescans                                 | iken          | done    |                                                                                                              |
| kenscans                                  | iken          | done    |                                                                                                              |
| magusmanga                                | iken          | blocked | probe 2026-10-03: cloudflare                                                                                 |
| nyxscans                                  | iken          | blocked | probe 2026-10-03: cloudflare                                                                                 |
| orionscans                                | iken          | done    |                                                                                                              |
| renascans                                 | iken          | done    |                                                                                                              |
| sanascans                                 | iken          | done    |                                                                                                              |
| vanillascans                              | iken          | blocked | probe 2026-10-03: http:521                                                                                   |
| vortexscans                               | iken          | done    |                                                                                                              |
| mangadrama                                | initmanga     | done    | newest chapters are coin-locked (live getPages of the newest fails by design)                                |
| artlapsa                                  | keyoapp       | done    |                                                                                                              |
| asmotoon                                  | keyoapp       | blocked | probe 2026-10-03: cloudflare                                                                                 |
| erisscans                                 | keyoapp       | done    |                                                                                                              |
| grimscans                                 | keyoapp       | done    | CDN serves images as text/plain (mr-ext image check fails; bytes are images)                                 |
| kaizenscan                                | keyoapp       | blocked | probe 2026-10-03: cloudflare                                                                                 |
| kewnscans                                 | keyoapp       | done    | CDN serves images as text/plain (mr-ext image check fails; bytes are images)                                 |
| lunatoons                                 | keyoapp       | blocked | probe 2026-10-03: cloudflare                                                                                 |
| meitoon                                   | keyoapp       | blocked | probe 2026-10-03: cloudflare                                                                                 |
| mistscans                                 | keyoapp       | done    |                                                                                                              |
| nyanukafe                                 | keyoapp       | done    | CDN serves images as text/plain (mr-ext image check fails; bytes are images)                                 |
| nyrascans                                 | keyoapp       | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                             |
| paradisescans                             | keyoapp       | blocked | site redesigned (no Keyoapp markup)                                                                          |
| ritharscans                               | keyoapp       | done    |                                                                                                              |
| suryascans                                | keyoapp       | done    | slow image CDN                                                                                               |
| timelesstoons                             | keyoapp       | done    |                                                                                                              |
| writerscans                               | keyoapp       | done    |                                                                                                              |
| manhuaplusorg                             | liliana       | done    |                                                                                                              |
| allporncomic                              | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| allporncomicio                            | madara        | done    |                                                                                                              |
| anisascans                                | madara        | blocked | probe 2026-10-03: http:522                                                                                   |
| apcomics                                  | madara        | done    |                                                                                                              |
| aquamanga                                 | madara        | blocked | site shows 'temporarily offline'                                                                             |
| battleinfivesecondsaftermeeting           | madara        | done    |                                                                                                              |
| boratscans                                | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| brainrotcomics                            | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| bunmanga                                  | madara        | done    | live: newest chapter page answers 403                                                                        |
| cocomic                                   | madara        | done    |                                                                                                              |
| cucumbermanga                             | madara        | done    |                                                                                                              |
| decadencescans                            | madara        | done    |                                                                                                              |
| dragontea                                 | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| ero18x                                    | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| frierenonline                             | madara        | done    | slow site (live test timed out once)                                                                         |
| gakamangas                                | madara        | done    |                                                                                                              |
| galaxydegenscans                          | madara        | done    |                                                                                                              |
| gedecomix                                 | madara        | done    |                                                                                                              |
| gingertoon                                | madara        | blocked | listing and admin-ajax behind a 'Checking your browser' page                                                 |
| gourmetscans                              | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| hentai4free                               | madara        | done    |                                                                                                              |
| hentaisco                                 | madara        | blocked | probe 2026-10-03: http:403                                                                                   |
| hentaixcomic                              | madara        | done    |                                                                                                              |
| hentaixdickgirl                           | madara        | done    |                                                                                                              |
| hentaixyuri                               | madara        | done    |                                                                                                              |
| hm2d                                      | madara        | blocked | probe 2026-10-03: dead:TimeoutError                                                                          |
| hunlightcomics                            | madara        | done    |                                                                                                              |
| jinmangas                                 | madara        | blocked | redirects to mangafree.info (= Mangafree)                                                                    |
| kissmangain                               | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| ksgroupscans                              | madara        | done    |                                                                                                              |
| kunmangaonline                            | madara        | done    |                                                                                                              |
| lhtranslation                             | madara        | done    |                                                                                                              |
| likemangain                               | madara        | done    |                                                                                                              |
| lilymanga                                 | madara        | done    |                                                                                                              |
| linkmanga                                 | madara        | done    | newest chapter images 404 on the site (older chapters fine)                                                  |
| madaradex                                 | madara        | blocked | needs site cookies (mdx_fp/mdx_auth refresh); no cookie jar                                                  |
| mahouirexnohentaikarte                    | madara        | blocked | single-series site; chapter API answers 404                                                                  |
| manga18free                               | madara        | done    |                                                                                                              |
| manga18x                                  | madara        | done    | newest chapter images 404 on the site (older chapters fine)                                                  |
| mangadass                                 | madara        | done    |                                                                                                              |
| mangadia                                  | madara        | blocked | probe 2026-10-03: http:526                                                                                   |
| mangadistrict                             | madara        | done    |                                                                                                              |
| mangaforfreecom                           | madara        | done    |                                                                                                              |
| mangafree                                 | madara        | done    |                                                                                                              |
| mangagg                                   | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| mangahe                                   | madara        | blocked | probe 2026-10-03: http:522                                                                                   |
| mangaka                                   | madara        | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                             |
| mangakiss                                 | madara        | blocked | probe 2026-10-03: http:523                                                                                   |
| mangamaniacs                              | madara        | done    |                                                                                                              |
| mangaowlio                                | madara        | done    |                                                                                                              |
| mangareadorg                              | madara        | done    |                                                                                                              |
| mangasushi                                | madara        | done    |                                                                                                              |
| manhuahot                                 | madara        | done    |                                                                                                              |
| manhuanext                                | madara        | done    |                                                                                                              |
| manhuaplus                                | madara        | done    |                                                                                                              |
| manhuatop                                 | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| manhuaus                                  | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| manhuazonghe                              | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| manhwa68                                  | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| manhwacomics                              | madara        | done    | newest chapter images 404 on the site (older chapters fine)                                                  |
| manhwaden                                 | madara        | done    |                                                                                                              |
| manhwaget                                 | madara        | done    | site's newest chapter has placeholder images                                                                 |
| manhwamanhua                              | madara        | blocked | probe 2026-10-03: dead:ECONNRESET                                                                            |
| manhwanex                                 | madara        | done    |                                                                                                              |
| manhwareads                               | madara        | done    |                                                                                                              |
| manhwatoon                                | madara        | done    |                                                                                                              |
| manhwatop                                 | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| milftoon                                  | madara        | blocked | Madara archive gone (/comics/ is 404)                                                                        |
| octopusmanga                              | madara        | done    |                                                                                                              |
| orchisasia                                | madara        | done    |                                                                                                              |
| paritehaber                               | madara        | done    |                                                                                                              |
| petrotechsociety                          | madara        | done    |                                                                                                              |
| rosesquadscans                            | madara        | blocked | series pages redirect to wp-login.php (login required)                                                       |
| s2manga                                   | madara        | done    |                                                                                                              |
| setsuscans                                | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| sleepytranslations                        | madara        | blocked | probe 2026-10-03: http:403                                                                                   |
| spmanhwa                                  | madara        | blocked | admin-ajax connection fails                                                                                  |
| toongod                                   | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| toonily                                   | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| toonizy                                   | madara        | done    |                                                                                                              |
| topmanhua                                 | madara        | done    | live: newest chapter images 403                                                                              |
| topmanhuafan                              | madara        | done    |                                                                                                              |
| topmanhuanet                              | madara        | done    | live: image CDN 526                                                                                          |
| tritiniascans                             | madara        | done    |                                                                                                              |
| wearehunger                               | madara        | done    |                                                                                                              |
| webtoonscan                               | madara        | blocked | probe 2026-10-03: http:403                                                                                   |
| webtoonxyz                                | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| wuxiaworld                                | madara        | done    |                                                                                                              |
| yakshacomics                              | madara        | blocked | JS challenge (hcdn-cgi) bound to cookies                                                                     |
| yaoihub                                   | madara        | done    |                                                                                                              |
| yaoiscan                                  | madara        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| zazamanga                                 | madara        | done    |                                                                                                              |
| zinmanga                                  | madara        | done    | newest chapter images 404 on the site (older chapters fine)                                                  |
| zinmanganet                               | madara        | blocked | chapter list no longer in page or ajax                                                                       |
| woopread                                  | madaralegacy  | blocked | redesigned as a Next.js app (2026-10-03), no longer Madara                                                   |
| eighteenporncomic                         | manga18       | done    |                                                                                                              |
| hentai3zcc                                | manga18       | blocked | probe 2026-10-03: cloudflare                                                                                 |
| manga18club                               | manga18       | blocked | probe 2026-10-03: http:403                                                                                   |
| mangabat                                  | mangabox      | done    |                                                                                                              |
| mangakakalot                              | mangabox      | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| manganelo                                 | mangabox      | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| readattackontitanshingekinokyojinmanga    | mangacatalog  | done    |                                                                                                              |
| readberserkmanga                          | mangacatalog  | done    |                                                                                                              |
| readblackclovermangaonline                | mangacatalog  | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                             |
| readchainsawmanmangaonline                | mangacatalog  | done    |                                                                                                              |
| readfairytailedenszeromangaonline         | mangacatalog  | done    |                                                                                                              |
| readjujutsukaisenmangaonline              | mangacatalog  | done    |                                                                                                              |
| readkingdommangaonline                    | mangacatalog  | done    |                                                                                                              |
| readnanatsunotaizai7deadlysinsmangaonline | mangacatalog  | done    |                                                                                                              |
| readonepiecemangaonline                   | mangacatalog  | done    |                                                                                                              |
| readonepunchmanmangaonlinetwo             | mangacatalog  | done    |                                                                                                              |
| readsololevelingmangamanhwaonline         | mangacatalog  | done    |                                                                                                              |
| readtokyoghoulretokyoghoulmangaonline     | mangacatalog  | done    |                                                                                                              |
| arcrelight                                | mangadventure | done    |                                                                                                              |
| assortedscans                             | mangadventure | done    |                                                                                                              |
| mangafoxfun                               | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| mangahereonl                              | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| mangahubio                                | mangahub      | blocked | probe 2026-10-03: cloudflare                                                                                 |
| mangakakalotfun                           | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| manganel                                  | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| mangaonlinefun                            | mangahub      | blocked | probe 2026-10-03: dead:TimeoutError                                                                          |
| mangapandaonl                             | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| mangareadersite                           | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| mangatoday                                | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| onemangaco                                | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| onemangainfo                              | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                    |
| mangabuddy                                | mangak        | done    |                                                                                                              |
| toonilyme                                 | mangak        | done    |                                                                                                              |
| manganow                                  | mangareader   | done    |                                                                                                              |
| mangataro                                 | mangataro     | done    |                                                                                                              |
| roliascan                                 | mangataro     | done    | live: Latest page 2 can repeat a page-1 entry as the list shifts (site-side)                                 |
| akazascans                                | mangathemesia | done    |                                                                                                              |
| arenascans                                | mangathemesia | done    |                                                                                                              |
| asterscans                                | mangathemesia | done    |                                                                                                              |
| athreascans                               | mangathemesia | done    |                                                                                                              |
| comicasura                                | mangathemesia | done    |                                                                                                              |
| culturedworks                             | mangathemesia | done    |                                                                                                              |
| elftoon                                   | mangathemesia | blocked | moved to elftoon.net, redesigned (Tailwind app)                                                              |
| erosscans                                 | mangathemesia | done    |                                                                                                              |
| evascans                                  | mangathemesia | done    |                                                                                                              |
| galaxymanga                               | mangathemesia | done    |                                                                                                              |
| hadesscans                                | mangathemesia | blocked | site under maintenance                                                                                       |
| kingofshojo                               | mangathemesia | done    |                                                                                                              |
| lagoonscans                               | mangathemesia | done    |                                                                                                              |
| madarascans                               | mangathemesia | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| mangatrend                                | mangathemesia | done    |                                                                                                              |
| mangatx                                   | mangathemesia | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                             |
| nexcomic                                  | mangathemesia | blocked | probe 2026-10-03: http:522                                                                                   |
| rackus                                    | mangathemesia | done    |                                                                                                              |
| ragescans                                 | mangathemesia | blocked | probe 2026-10-03: cloudflare                                                                                 |
| ravenscans                                | mangathemesia | done    |                                                                                                              |
| razure                                    | mangathemesia | blocked | site redesigned (no MangaThemesia list)                                                                      |
| rizzcomic                                 | mangathemesia | done    | rotating slug token removed from stored urls                                                                 |
| rizzcomicunoriginal                       | mangathemesia | blocked | probe 2026-10-03: http:500                                                                                   |
| rokaricomics                              | mangathemesia | done    |                                                                                                              |
| thunderscans                              | mangathemesia | done    |                                                                                                              |
| violetscans                               | mangathemesia | done    |                                                                                                              |
| manhwahub                                 | manhwaz       | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                             |
| manhwaz                                   | manhwaz       | blocked | probe 2026-10-03: dead:ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR                                                    |
| readcomicsonline                          | mmrcms        | blocked | probe 2026-10-03: cloudflare                                                                                 |
| monochromecustom                          | monochrome    | blocked | API host is a user setting; the manifest allowlist is fixed                                                  |
| monochromescans                           | monochrome    | done    |                                                                                                              |
| theblank                                  | pam           | blocked | probe 2026-10-03: http:403                                                                                   |
| divascans                                 | vinetheme     | done    |                                                                                                              |
| drakescans                                | vinetheme     | done    |                                                                                                              |
| kaynscans                                 | vinetheme     | done    |                                                                                                              |
| valirscans                                | vinetheme     | done    |                                                                                                              |
| witchscans                                | vinetheme     | done    |                                                                                                              |
| xoxocomics                                | wpcomics      | ported  | in pending/: image urls answer with the home page (also via curl, 2026-10-03)                                |
| murimscan                                 | zeistmanga    | done    | pages from the data-post-body attribute                                                                      |
| akaicomic                                 | standalone    | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                             |
| alandal                                   | standalone    | blocked | site is now a company landing page; qq.alandal.com API has no DNS                                            |
| allanime                                  | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| alphamanga                                | standalone    | later   | tiles need rotate/flip; SDK TileOp only copies rectangles                                                    |
| asiatoon                                  | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| asurascans                                | standalone    | done    | free chapters only; tiled premium pages handled by transformImage                                            |
| atsumaru                                  | standalone    | done    |                                                                                                              |
| aurora                                    | standalone    | done    |                                                                                                              |
| batcave                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| bbato                                     | standalone    | done    | the #1 title can have no chapters yet; the test picks the first with chapters                                |
| bookwalker                                | standalone    | todo    |                                                                                                              |
| broccolisoup                              | standalone    | done    | singleseries; character text pages not ported                                                                |
| buttsmithy                                | standalone    | done    |                                                                                                              |
| clonemanga                                | standalone    | done    |                                                                                                              |
| clowncorps                                | standalone    | done    | singleseries; author's-notes text page not ported                                                            |
| collectedcurios                           | standalone    | done    |                                                                                                              |
| colorizedmangas                           | standalone    | done    |                                                                                                              |
| comiccx                                   | standalone    | blocked | redesigned (2026-10-03): /api/manga is gone                                                                  |
| comichubfree                              | standalone    | ported  | in pending/: image urls answer 404 HTML (also via curl, 2026-10-03; same platform as xoxocomics)             |
| comickfan                                 | standalone    | blocked | probe 2026-10-03: http:522                                                                                   |
| comicland                                 | standalone    | done    |                                                                                                              |
| comix                                     | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| coolmic                                   | standalone    | todo    |                                                                                                              |
| cutiecomics                               | standalone    | done    |                                                                                                              |
| darklegacycomics                          | standalone    | done    | singleseries                                                                                                 |
| darkscience                               | standalone    | done    | singleseries                                                                                                 |
| darthsdroids                              | standalone    | done    |                                                                                                              |
| dflowscans                                | standalone    | blocked | probe 2026-10-03: http:404                                                                                   |
| digitalcomicmuseum                        | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| doujinio                                  | standalone    | blocked | Cloudflare challenge ('Hold on...') on every page                                                            |
| doujins                                   | standalone    | done    |                                                                                                              |
| duskscans                                 | standalone    | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                             |
| dynasty                                   | standalone    | done    | covers/tags assets bundled as TS; no thumbnails for chapter-only entries                                     |
| eggporncomics                             | standalone    | done    | the site's own search finds nothing (2026-10-03)                                                             |
| egscomics                                 | standalone    | done    | singleseries                                                                                                 |
| elanschool                                | standalone    | blocked | probe 2026-10-03: http:403                                                                                   |
| emaqi                                     | standalone    | later   | needs RSA-OAEP key exchange + AES-GCM page decryption (SDK has neither)                                      |
| existentialcomics                         | standalone    | done    | singleseries                                                                                                 |
| explosm                                   | standalone    | done    |                                                                                                              |
| fairyscans                                | standalone    | blocked | probe 2026-10-03: http:520                                                                                   |
| flamecomics                               | standalone    | blocked | site now redirects to a Discord invite (2026-10-03)                                                          |
| girlstop                                  | standalone    | done    |                                                                                                              |
| greedscans                                | standalone    | blocked | probe 2026-10-03: http:502                                                                                   |
| grrlpower                                 | standalone    | done    | singleseries; author's-notes text page not ported                                                            |
| gunnerkriggcourt                          | standalone    | done    | singleseries                                                                                                 |
| gwtb                                      | standalone    | done    | singleseries                                                                                                 |
| hentaihere                                | standalone    | blocked | redesigned (2026-10-03): directory pages now redirect to /browse                                             |
| hentaikisu                                | standalone    | done    |                                                                                                              |
| hentaikun                                 | standalone    | done    |                                                                                                              |
| hentainexus                               | standalone    | done    |                                                                                                              |
| hentairead                                | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| hentaireadio                              | standalone    | blocked | probe 2026-10-03: dead:TimeoutError                                                                          |
| hentaitnt                                 | standalone    | done    |                                                                                                              |
| hentara                                   | standalone    | done    |                                                                                                              |
| heytoon                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| hiveworks                                 | standalone    | todo    |                                                                                                              |
| honkaiimpact                              | standalone    | done    |                                                                                                              |
| hotcomics                                 | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| hyakuro                                   | standalone    | ported  | in pending/: every /backend/uploads image (covers too) answers 404 (2026-10-03)                              |
| imanevilgod                               | standalone    | done    | singleseries                                                                                                 |
| infinityscans                             | standalone    | blocked | API returns nothing without a session cookie set by a WebView captcha                                        |
| inkr                                      | standalone    | todo    |                                                                                                              |
| irovedout                                 | standalone    | done    | singleseries                                                                                                 |
| jnovel                                    | standalone    | later   | pages are E4P manifests with custom TIFF/XEBP containers needing pixel decoding                              |
| kaliscancom                               | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| kappabeast                                | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| keenspot                                  | standalone    | done    | singleseries                                                                                                 |
| killsixbilliondemons                      | standalone    | done    |                                                                                                              |
| kingcomix                                 | standalone    | done    |                                                                                                              |
| kmanga                                    | standalone    | todo    |                                                                                                              |
| kodansha                                  | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| kuramanga                                 | standalone    | done    |                                                                                                              |
| leslievictims                             | standalone    | done    |                                                                                                              |
| likemanga                                 | standalone    | done    |                                                                                                              |
| loadingartist                             | standalone    | done    | singleseries                                                                                                 |
| lolobun                                   | standalone    | done    |                                                                                                              |
| luminaretranslations                      | standalone    | done    |                                                                                                              |
| lusttoon                                  | standalone    | done    |                                                                                                              |
| madokami                                  | standalone    | blocked | probe 2026-10-03: http:401                                                                                   |
| mangabay                                  | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| mangabolt                                 | standalone    | done    |                                                                                                              |
| mangack                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| mangacloud                                | standalone    | blocked | API answers 409 until a WebView posts a Turnstile token                                                      |
| mangade                                   | standalone    | done    |                                                                                                              |
| mangademon                                | standalone    | done    |                                                                                                              |
| mangafox                                  | standalone    | done    | mobile roll_manga reader                                                                                     |
| mangafreak                                | standalone    | done    |                                                                                                              |
| mangago                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| mangahen                                  | standalone    | done    |                                                                                                              |
| mangahere                                 | standalone    | done    | JS p.a.c.k.e.r unpacker in src/packer.ts                                                                     |
| mangakatana                               | standalone    | done    | images are octet-stream: empty transformImage lets the host sniff them                                       |
| mangalix                                  | standalone    | done    | catalog parsed from the main script's JS literal; per-series /chapters/<slug>.json (the .gz archive is gone) |
| mangamelon                                | standalone    | done    |                                                                                                              |
| mangamirai                                | standalone    | todo    |                                                                                                              |
| mangamo                                   | standalone    | todo    |                                                                                                              |
| mangamob                                  | standalone    | done    |                                                                                                              |
| mangapdf                                  | standalone    | blocked | probe 2026-10-03: http:521                                                                                   |
| mangapill                                 | standalone    | done    |                                                                                                              |
| mangaplaza                                | standalone    | todo    | needs a SpeedBinb image descrambler (transformImage); deferred                                               |
| mangarawclub                              | standalone    | done    |                                                                                                              |
| mangareadercc                             | standalone    | blocked | probe 2026-10-03: http:526                                                                                   |
| mangatown                                 | standalone    | done    |                                                                                                              |
| mangauno                                  | standalone    | done    |                                                                                                              |
| mangayi                                   | standalone    | done    |                                                                                                              |
| manhuarush                                | standalone    | blocked | probe 2026-10-03: http:404                                                                                   |
| manhwa18                                  | standalone    | done    |                                                                                                              |
| manhwabuddy                               | standalone    | done    |                                                                                                              |
| manhwalike                                | standalone    | done    |                                                                                                              |
| manhwaread                                | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| manhwazone                                | standalone    | done    | manhwatop CDN 403s Node's TLS (mr-ext smoke) but serves curl/Chromium with Referer manhwatop.com             |
| megatokyo                                 | standalone    | done    | singleseries                                                                                                 |
| mehgazone                                 | standalone    | done    | WordPress app-password preferences; excerpt text page not ported                                             |
| mgreadio                                  | standalone    | done    |                                                                                                              |
| mlbblore                                  | standalone    | done    |                                                                                                              |
| multporn                                  | standalone    | done    | gallery is inside <noscript>; re-parsed                                                                      |
| myadultcomics                             | standalone    | done    |                                                                                                              |
| myhentaicomics                            | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| myhentaigallery                           | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| newmanhwa                                 | standalone    | done    |                                                                                                              |
| ninehentai                                | standalone    | done    |                                                                                                              |
| ninekon                                   | standalone    | blocked | rebranded to doujum.com, a different app (2026-10-03)                                                        |
| nixmanga                                  | standalone    | blocked | probe 2026-10-03: http:521                                                                                   |
| nuviatoon                                 | standalone    | blocked | origin down: HTTP 522 (2026-10-03)                                                                           |
| nuxscans                                  | standalone    | ported  | in pending/: the site's oldest chapter post is a 404 and chapters 147/148 share a url (2026-10-03)           |
| oglaf                                     | standalone    | done    | singleseries                                                                                                 |
| ohjoysextoy                               | standalone    | done    |                                                                                                              |
| omoi                                      | standalone    | done    | pages XORed with 174 in transformImage; newest chapters are paid                                             |
| onepunchmanonline                         | standalone    | done    | singleseries; site moved to w20.1punchman.com; newest chapter has only a placeholder image                   |
| onlythebesthentai                         | standalone    | done    |                                                                                                              |
| oots                                      | standalone    | done    | singleseries                                                                                                 |
| oppaistream                               | standalone    | done    |                                                                                                              |
| patchfriday                               | standalone    | done    | singleseries                                                                                                 |
| philiascans                               | standalone    | done    | page DRM (aesctr4/aesctr/chacha/xor + tile shuffle) decrypted in transformImage; newest chapters are paid    |
| porncomix                                 | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| pornhwa18                                 | standalone    | done    |                                                                                                              |
| questionablecontent                       | standalone    | done    | singleseries; author's-notes text page not ported                                                            |
| randowiz                                  | standalone    | blocked | probe 2026-10-03: http:403                                                                                   |
| readallcomicscom                          | standalone    | blocked | probe 2026-10-03: http:522                                                                                   |
| readcomiconline                           | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| readhorimiyaonline                        | standalone    | done    | singleseries                                                                                                 |
| readvagabondmanga                         | standalone    | done    |                                                                                                              |
| reallifecomics                            | standalone    | done    | singleseries                                                                                                 |
| reimanga                                  | standalone    | ported  | in pending/: chapter and reader pages are behind a Cloudflare challenge (API only covers lists/details)      |
| revivalscans                              | standalone    | done    |                                                                                                              |
| rinkocomics                               | standalone    | done    | newest chapters are paid (live smoke stops at getPages)                                                      |
| sabrinaonline                             | standalone    | done    | singleseries                                                                                                 |
| sacachispa                                | standalone    | done    | newest chapters can be Patreon-exclusive (the site says so)                                                  |
| saturdaymorningbreakfastcomics            | standalone    | done    | singleseries; hover-text page and bundled thumbnail not ported                                               |
| scansgg                                   | standalone    | done    | test picks the first popular series with chapters                                                            |
| schlockmercenary                          | standalone    | done    |                                                                                                              |
| silentquill                               | standalone    | done    |                                                                                                              |
| sirenscans                                | standalone    | done    | CDN serves JPEGs as text/plain: empty transformImage                                                         |
| solarandsundry                            | standalone    | done    | singleseries                                                                                                 |
| spyfakku                                  | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                            |
| stonescape                                | standalone    | done    |                                                                                                              |
| sunshinebutterflyscans                    | standalone    | done    |                                                                                                              |
| supermega                                 | standalone    | done    | singleseries                                                                                                 |
| swordscomic                               | standalone    | done    | singleseries; title-text page not ported                                                                     |
| tapastic                                  | standalone    | done    | newest episodes are paid (smoke stops at getPages); author's-note text pages not ported                      |
| tcbscans                                  | standalone    | done    |                                                                                                              |
| teamshadowi                               | standalone    | done    |                                                                                                              |
| templescan                                | standalone    | blocked | every page redirects to a Cloudflare Turnstile /challenge                                                    |
| theduckwebcomics                          | standalone    | done    | 18+ comics need a login; live runner picks the #1 comic, which currently is one                              |
| thegirlfromrandomchattingmangaonline      | standalone    | done    | singleseries                                                                                                 |
| thepropertyofhate                         | standalone    | done    | singleseries                                                                                                 |
| todaymanga                                | standalone    | blocked | probe 2026-10-03: http:502                                                                                   |
| toonz                                     | standalone    | done    |                                                                                                              |
| vgperson                                  | standalone    | done    |                                                                                                              |
| visionhaze                                | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| vixenlogic                                | standalone    | done    | singleseries                                                                                                 |
| vizshonenjump                             | standalone    | todo    | 2 sources                                                                                                    |
| voyceme                                   | standalone    | ported  | in pending/: graphql.voyce.me answers 503                                                                    |
| vyvymanga                                 | standalone    | blocked | probe 2026-10-03: http:503                                                                                   |
| warforrayuba                              | standalone    | done    | pages via Imgur's album API (Cubari proxy gone); newest album deleted on Imgur                               |
| webdexscans                               | standalone    | done    |                                                                                                              |
| webnovel                                  | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| weebcentral                               | standalone    | done    |                                                                                                              |
| xlecx                                     | standalone    | done    | some posts need an account; live runner picks the #1 post, which currently does (test skips such posts)      |
| xomanga                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                 |
| xyzcomics                                 | standalone    | done    |                                                                                                              |
| yaoihot                                   | standalone    | done    |                                                                                                              |
| yorai                                     | standalone    | blocked | domain parked for sale (2026-10-03)                                                                          |

## all

| Extension | Theme      | Status | Notes    |
| --------- | ---------- | ------ | -------- |
| mangadex  | standalone | done   | existing |

## Pending

`pending/<lang>/<id>/` holds extensions that are ported but cannot be tested from here (e.g. Cloudflare challenges
Node's fetch while curl passes). They are not built, tested or published. Move one back to `src/<lang>/` and run
`scripts/record.sh` when it can be tested.
