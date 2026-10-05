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
node scripts/scaffold.mjs ja id1 id2 [--theme common]       # scaffold from build.gradle.kts (skips missing themes)
node scripts/porting.mjs ja/id1 done "note"                 # lang/ prefix: ids repeat across languages
node scripts/porting.mjs --todo ja                          # one language's todo rows
```

An id already used by another language gets the package/manifest id `<id>-<lang>` (scaffold.mjs does it).

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

| Extension                                 | Theme         | Status  | Notes                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bakkin                                    | bakkin        | done    |                                                                                                                                                                                                                                                                                                                                               |
| bakkinselfhosted                          | bakkin        | blocked | probe 2026-10-03: dead:ECONNREFUSED                                                                                                                                                                                                                                                                                                           |
| eightmuses                                | eromuse       | done    |                                                                                                                                                                                                                                                                                                                                               |
| erofus                                    | eromuse       | done    |                                                                                                                                                                                                                                                                                                                                               |
| ezmanga                                   | ezmanhwa      | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| qiscans                                   | ezmanhwa      | done    |                                                                                                                                                                                                                                                                                                                                               |
| deathtollscans                            | foolslide     | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangatellers                              | foolslide     | done    |                                                                                                                                                                                                                                                                                                                                               |
| goda                                      | goda          | ported  | template done; site's chapter API challenges Node fetch                                                                                                                                                                                                                                                                                       |
| dankefurslesen                            | guya          | done    |                                                                                                                                                                                                                                                                                                                                               |
| guya                                      | guya          | done    |                                                                                                                                                                                                                                                                                                                                               |
| hachirumi                                 | guya          | done    |                                                                                                                                                                                                                                                                                                                                               |
| luascans                                  | heancms       | done    |                                                                                                                                                                                                                                                                                                                                               |
| omegascans                                | heancms       | done    | login preferences (plain text, token kept in memory)                                                                                                                                                                                                                                                                                          |
| hiperdex                                  | hiper         | done    |                                                                                                                                                                                                                                                                                                                                               |
| hijalascans                               | iken          | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| hivescans                                 | iken          | done    |                                                                                                                                                                                                                                                                                                                                               |
| kenscans                                  | iken          | done    |                                                                                                                                                                                                                                                                                                                                               |
| magusmanga                                | iken          | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| nyxscans                                  | iken          | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| orionscans                                | iken          | done    |                                                                                                                                                                                                                                                                                                                                               |
| renascans                                 | iken          | done    |                                                                                                                                                                                                                                                                                                                                               |
| sanascans                                 | iken          | done    |                                                                                                                                                                                                                                                                                                                                               |
| vanillascans                              | iken          | blocked | probe 2026-10-03: http:521                                                                                                                                                                                                                                                                                                                    |
| vortexscans                               | iken          | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangadrama                                | initmanga     | done    | newest chapters are coin-locked (live getPages of the newest fails by design)                                                                                                                                                                                                                                                                 |
| artlapsa                                  | keyoapp       | done    |                                                                                                                                                                                                                                                                                                                                               |
| asmotoon                                  | keyoapp       | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| erisscans                                 | keyoapp       | done    |                                                                                                                                                                                                                                                                                                                                               |
| grimscans                                 | keyoapp       | done    | CDN serves images as text/plain (mr-ext image check fails; bytes are images)                                                                                                                                                                                                                                                                  |
| kaizenscan                                | keyoapp       | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| kewnscans                                 | keyoapp       | done    | CDN serves images as text/plain (mr-ext image check fails; bytes are images)                                                                                                                                                                                                                                                                  |
| lunatoons                                 | keyoapp       | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| meitoon                                   | keyoapp       | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| mistscans                                 | keyoapp       | done    |                                                                                                                                                                                                                                                                                                                                               |
| nyanukafe                                 | keyoapp       | done    | CDN serves images as text/plain (mr-ext image check fails; bytes are images)                                                                                                                                                                                                                                                                  |
| nyrascans                                 | keyoapp       | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                                                                                                                                                                                                                                                              |
| paradisescans                             | keyoapp       | blocked | site redesigned (no Keyoapp markup)                                                                                                                                                                                                                                                                                                           |
| ritharscans                               | keyoapp       | done    |                                                                                                                                                                                                                                                                                                                                               |
| suryascans                                | keyoapp       | done    | slow image CDN                                                                                                                                                                                                                                                                                                                                |
| timelesstoons                             | keyoapp       | done    |                                                                                                                                                                                                                                                                                                                                               |
| writerscans                               | keyoapp       | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhuaplusorg                             | liliana       | done    |                                                                                                                                                                                                                                                                                                                                               |
| allporncomic                              | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| allporncomicio                            | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| anisascans                                | madara        | blocked | probe 2026-10-03: http:522                                                                                                                                                                                                                                                                                                                    |
| apcomics                                  | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| aquamanga                                 | madara        | blocked | site shows 'temporarily offline'                                                                                                                                                                                                                                                                                                              |
| battleinfivesecondsaftermeeting           | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| boratscans                                | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| brainrotcomics                            | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| bunmanga                                  | madara        | done    | live: newest chapter page answers 403                                                                                                                                                                                                                                                                                                         |
| cocomic                                   | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| cucumbermanga                             | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| decadencescans                            | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| dragontea                                 | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| ero18x                                    | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| frierenonline                             | madara        | done    | slow site (live test timed out once)                                                                                                                                                                                                                                                                                                          |
| gakamangas                                | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| galaxydegenscans                          | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| gedecomix                                 | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| gingertoon                                | madara        | blocked | listing and admin-ajax behind a 'Checking your browser' page                                                                                                                                                                                                                                                                                  |
| gourmetscans                              | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| hentai4free                               | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| hentaisco                                 | madara        | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| hentaixcomic                              | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| hentaixdickgirl                           | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| hentaixyuri                               | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| hm2d                                      | madara        | blocked | probe 2026-10-03: dead:TimeoutError                                                                                                                                                                                                                                                                                                           |
| hunlightcomics                            | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| jinmangas                                 | madara        | blocked | redirects to mangafree.info (= Mangafree)                                                                                                                                                                                                                                                                                                     |
| kissmangain                               | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| ksgroupscans                              | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| kunmangaonline                            | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| lhtranslation                             | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| likemangain                               | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| lilymanga                                 | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| linkmanga                                 | madara        | done    | newest chapter images 404 on the site (older chapters fine)                                                                                                                                                                                                                                                                                   |
| madaradex                                 | madara        | blocked | needs site cookies (mdx_fp/mdx_auth refresh); no cookie jar                                                                                                                                                                                                                                                                                   |
| mahouirexnohentaikarte                    | madara        | blocked | single-series site; chapter API answers 404                                                                                                                                                                                                                                                                                                   |
| manga18free                               | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manga18x                                  | madara        | done    | newest chapter images 404 on the site (older chapters fine)                                                                                                                                                                                                                                                                                   |
| mangadass                                 | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangadia                                  | madara        | blocked | probe 2026-10-03: http:526                                                                                                                                                                                                                                                                                                                    |
| mangadistrict                             | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangaforfreecom                           | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangafree                                 | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangagg                                   | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| mangahe                                   | madara        | blocked | probe 2026-10-03: http:522                                                                                                                                                                                                                                                                                                                    |
| mangaka                                   | madara        | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                                                                                                                                                                                                                                                              |
| mangakiss                                 | madara        | blocked | probe 2026-10-03: http:523                                                                                                                                                                                                                                                                                                                    |
| mangamaniacs                              | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangaowlio                                | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangareadorg                              | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangasushi                                | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhuahot                                 | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhuanext                                | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhuaplus                                | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhuatop                                 | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| manhuaus                                  | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| manhuazonghe                              | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| manhwa68                                  | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| manhwacomics                              | madara        | done    | newest chapter images 404 on the site (older chapters fine)                                                                                                                                                                                                                                                                                   |
| manhwaden                                 | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhwaget                                 | madara        | done    | site's newest chapter has placeholder images                                                                                                                                                                                                                                                                                                  |
| manhwamanhua                              | madara        | blocked | probe 2026-10-03: dead:ECONNRESET                                                                                                                                                                                                                                                                                                             |
| manhwanex                                 | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhwareads                               | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhwatoon                                | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhwatop                                 | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| milftoon                                  | madara        | blocked | Madara archive gone (/comics/ is 404)                                                                                                                                                                                                                                                                                                         |
| octopusmanga                              | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| orchisasia                                | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| paritehaber                               | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| petrotechsociety                          | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| rosesquadscans                            | madara        | blocked | series pages redirect to wp-login.php (login required)                                                                                                                                                                                                                                                                                        |
| s2manga                                   | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| setsuscans                                | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| sleepytranslations                        | madara        | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| spmanhwa                                  | madara        | blocked | admin-ajax connection fails                                                                                                                                                                                                                                                                                                                   |
| toongod                                   | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| toonily                                   | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| toonizy                                   | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| topmanhua                                 | madara        | done    | live: newest chapter images 403                                                                                                                                                                                                                                                                                                               |
| topmanhuafan                              | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| topmanhuanet                              | madara        | done    | live: image CDN 526                                                                                                                                                                                                                                                                                                                           |
| tritiniascans                             | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| wearehunger                               | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| webtoonscan                               | madara        | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| webtoonxyz                                | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| wuxiaworld                                | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| yakshacomics                              | madara        | blocked | JS challenge (hcdn-cgi) bound to cookies                                                                                                                                                                                                                                                                                                      |
| yaoihub                                   | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| yaoiscan                                  | madara        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| zazamanga                                 | madara        | done    |                                                                                                                                                                                                                                                                                                                                               |
| zinmanga                                  | madara        | done    | newest chapter images 404 on the site (older chapters fine)                                                                                                                                                                                                                                                                                   |
| zinmanganet                               | madara        | blocked | chapter list no longer in page or ajax                                                                                                                                                                                                                                                                                                        |
| woopread                                  | madaralegacy  | blocked | redesigned as a Next.js app (2026-10-03), no longer Madara                                                                                                                                                                                                                                                                                    |
| eighteenporncomic                         | manga18       | done    |                                                                                                                                                                                                                                                                                                                                               |
| hentai3zcc                                | manga18       | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| manga18club                               | manga18       | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| mangabat                                  | mangabox      | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangakakalot                              | mangabox      | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| manganelo                                 | mangabox      | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| readattackontitanshingekinokyojinmanga    | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readberserkmanga                          | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readblackclovermangaonline                | mangacatalog  | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                                                                                                                                                                                                                                                              |
| readchainsawmanmangaonline                | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readfairytailedenszeromangaonline         | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readjujutsukaisenmangaonline              | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readkingdommangaonline                    | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readnanatsunotaizai7deadlysinsmangaonline | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readonepiecemangaonline                   | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readonepunchmanmangaonlinetwo             | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readsololevelingmangamanhwaonline         | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| readtokyoghoulretokyoghoulmangaonline     | mangacatalog  | done    |                                                                                                                                                                                                                                                                                                                                               |
| arcrelight                                | mangadventure | done    |                                                                                                                                                                                                                                                                                                                                               |
| assortedscans                             | mangadventure | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangafoxfun                               | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| mangahereonl                              | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| mangahubio                                | mangahub      | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| mangakakalotfun                           | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| manganel                                  | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| mangaonlinefun                            | mangahub      | blocked | probe 2026-10-03: dead:TimeoutError                                                                                                                                                                                                                                                                                                           |
| mangapandaonl                             | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| mangareadersite                           | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| mangatoday                                | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| onemangaco                                | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| onemangainfo                              | mangahub      | ported  | in pending/: Cloudflare challenges Node fetch on api.mghcdn.com (curl OK)                                                                                                                                                                                                                                                                     |
| mangabuddy                                | mangak        | done    |                                                                                                                                                                                                                                                                                                                                               |
| toonilyme                                 | mangak        | done    |                                                                                                                                                                                                                                                                                                                                               |
| manganow                                  | mangareader   | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangataro                                 | mangataro     | done    |                                                                                                                                                                                                                                                                                                                                               |
| roliascan                                 | mangataro     | done    | live: Latest page 2 can repeat a page-1 entry as the list shifts (site-side)                                                                                                                                                                                                                                                                  |
| akazascans                                | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| arenascans                                | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| asterscans                                | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| athreascans                               | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| comicasura                                | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| culturedworks                             | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| elftoon                                   | mangathemesia | blocked | moved to elftoon.net, redesigned (Tailwind app)                                                                                                                                                                                                                                                                                               |
| erosscans                                 | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| evascans                                  | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| galaxymanga                               | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| hadesscans                                | mangathemesia | blocked | site under maintenance                                                                                                                                                                                                                                                                                                                        |
| kingofshojo                               | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| lagoonscans                               | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| madarascans                               | mangathemesia | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| mangatrend                                | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangatx                                   | mangathemesia | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                                                                                                                                                                                                                                                              |
| nexcomic                                  | mangathemesia | blocked | probe 2026-10-03: http:522                                                                                                                                                                                                                                                                                                                    |
| rackus                                    | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| ragescans                                 | mangathemesia | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| ravenscans                                | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| razure                                    | mangathemesia | blocked | site redesigned (no MangaThemesia list)                                                                                                                                                                                                                                                                                                       |
| rizzcomic                                 | mangathemesia | done    | rotating slug token removed from stored urls                                                                                                                                                                                                                                                                                                  |
| rizzcomicunoriginal                       | mangathemesia | blocked | probe 2026-10-03: http:500                                                                                                                                                                                                                                                                                                                    |
| rokaricomics                              | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| thunderscans                              | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| violetscans                               | mangathemesia | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhwahub                                 | manhwaz       | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                                                                                                                                                                                                                                                              |
| manhwaz                                   | manhwaz       | blocked | probe 2026-10-03: dead:ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR                                                                                                                                                                                                                                                                                     |
| readcomicsonline                          | mmrcms        | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| monochromecustom                          | monochrome    | blocked | API host is a user setting; the manifest allowlist is fixed                                                                                                                                                                                                                                                                                   |
| monochromescans                           | monochrome    | done    |                                                                                                                                                                                                                                                                                                                                               |
| theblank                                  | pam           | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| divascans                                 | vinetheme     | done    |                                                                                                                                                                                                                                                                                                                                               |
| drakescans                                | vinetheme     | done    |                                                                                                                                                                                                                                                                                                                                               |
| kaynscans                                 | vinetheme     | done    |                                                                                                                                                                                                                                                                                                                                               |
| valirscans                                | vinetheme     | done    |                                                                                                                                                                                                                                                                                                                                               |
| witchscans                                | vinetheme     | done    |                                                                                                                                                                                                                                                                                                                                               |
| xoxocomics                                | wpcomics      | ported  | in pending/: image urls answer with the home page (also via curl, 2026-10-03)                                                                                                                                                                                                                                                                 |
| murimscan                                 | zeistmanga    | done    | pages from the data-post-body attribute                                                                                                                                                                                                                                                                                                       |
| akaicomic                                 | standalone    | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                                                                                                                                                                                                                                                              |
| alandal                                   | standalone    | blocked | site is now a company landing page; qq.alandal.com API has no DNS                                                                                                                                                                                                                                                                             |
| allanime                                  | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| alphamanga                                | standalone    | later   | tiles need rotate/flip; SDK TileOp only copies rectangles                                                                                                                                                                                                                                                                                     |
| asiatoon                                  | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| asurascans                                | standalone    | done    | free chapters only; tiled premium pages handled by transformImage                                                                                                                                                                                                                                                                             |
| atsumaru                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| aurora                                    | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| batcave                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| bbato                                     | standalone    | done    | the #1 title can have no chapters yet; the test picks the first with chapters                                                                                                                                                                                                                                                                 |
| bookwalker                                | standalone    | later   | pages are E4P manifests (same container decoding as J-Novel)                                                                                                                                                                                                                                                                                  |
| broccolisoup                              | standalone    | done    | singleseries; character text pages not ported                                                                                                                                                                                                                                                                                                 |
| buttsmithy                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| clonemanga                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| clowncorps                                | standalone    | done    | singleseries; author's-notes text page not ported                                                                                                                                                                                                                                                                                             |
| collectedcurios                           | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| colorizedmangas                           | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| comiccx                                   | standalone    | blocked | redesigned (2026-10-03): /api/manga is gone                                                                                                                                                                                                                                                                                                   |
| comichubfree                              | standalone    | ported  | in pending/: image urls answer 404 HTML (also via curl, 2026-10-03; same platform as xoxocomics)                                                                                                                                                                                                                                              |
| comickfan                                 | standalone    | blocked | probe 2026-10-03: http:522                                                                                                                                                                                                                                                                                                                    |
| comicland                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| comix                                     | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| coolmic                                   | standalone    | done    | pages: site-issued key + PBKDF2-SHA256 + AES-CBC in transformImage; newest chapters are paid                                                                                                                                                                                                                                                  |
| cutiecomics                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| darklegacycomics                          | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| darkscience                               | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| darthsdroids                              | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| dflowscans                                | standalone    | blocked | probe 2026-10-03: http:404                                                                                                                                                                                                                                                                                                                    |
| digitalcomicmuseum                        | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| doujinio                                  | standalone    | blocked | Cloudflare challenge ('Hold on...') on every page                                                                                                                                                                                                                                                                                             |
| doujins                                   | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| duskscans                                 | standalone    | blocked | probe 2026-10-03: dead:ENOTFOUND                                                                                                                                                                                                                                                                                                              |
| dynasty                                   | standalone    | done    | covers/tags assets bundled as TS; no thumbnails for chapter-only entries                                                                                                                                                                                                                                                                      |
| eggporncomics                             | standalone    | done    | the site's own search finds nothing (2026-10-03)                                                                                                                                                                                                                                                                                              |
| egscomics                                 | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| elanschool                                | standalone    | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| emaqi                                     | standalone    | done    | pure-TS RSA-OAEP (fixed 2048-bit key, CRT) + AES-GCM via host CTR; images verified decrypting live; unit test in test/crypto.test.ts; locked chapters need credentials in settings                                                                                                                                                            |
| existentialcomics                         | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| explosm                                   | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| fairyscans                                | standalone    | blocked | probe 2026-10-03: http:520                                                                                                                                                                                                                                                                                                                    |
| flamecomics                               | standalone    | blocked | site now redirects to a Discord invite (2026-10-03)                                                                                                                                                                                                                                                                                           |
| girlstop                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| greedscans                                | standalone    | blocked | probe 2026-10-03: http:502                                                                                                                                                                                                                                                                                                                    |
| grrlpower                                 | standalone    | done    | singleseries; author's-notes text page not ported                                                                                                                                                                                                                                                                                             |
| gunnerkriggcourt                          | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| gwtb                                      | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| hentaihere                                | standalone    | blocked | redesigned (2026-10-03): directory pages now redirect to /browse                                                                                                                                                                                                                                                                              |
| hentaikisu                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| hentaikun                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| hentainexus                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| hentairead                                | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| hentaireadio                              | standalone    | blocked | probe 2026-10-03: dead:TimeoutError                                                                                                                                                                                                                                                                                                           |
| hentaitnt                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| hentara                                   | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| heytoon                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| hiveworks                                 | standalone    | done    | popular order is random; comics without a standard archive page fail with 'unsupported chapter list' (as in Tachiyomi); urls are absolute (comics live on their own domains)                                                                                                                                                                  |
| honkaiimpact                              | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| hotcomics                                 | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| hyakuro                                   | standalone    | ported  | in pending/: every /backend/uploads image (covers too) answers 404 (2026-10-03)                                                                                                                                                                                                                                                               |
| imanevilgod                               | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| infinityscans                             | standalone    | blocked | API returns nothing without a session cookie set by a WebView captcha                                                                                                                                                                                                                                                                         |
| inkr                                      | standalone    | done    | catalog hydrated in batches and cached; .ikc pages AES-CBC (fixed key) in transformImage; login-only chapters not supported                                                                                                                                                                                                                   |
| irovedout                                 | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| jnovel                                    | standalone    | later   | pages are E4P manifests with custom TIFF/XEBP containers needing pixel decoding                                                                                                                                                                                                                                                               |
| kaliscancom                               | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| kappabeast                                | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| keenspot                                  | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| killsixbilliondemons                      | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| kingcomix                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| kmanga                                    | standalone    | done    | signed API (SHA-256/512 X-Kmanga-Hash); 4x4 tile shuffle via transformImage; newest chapters need rental                                                                                                                                                                                                                                      |
| kodansha                                  | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| kuramanga                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| leslievictims                             | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| likemanga                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| loadingartist                             | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| lolobun                                   | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| luminaretranslations                      | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| lusttoon                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| madokami                                  | standalone    | blocked | probe 2026-10-03: http:401                                                                                                                                                                                                                                                                                                                    |
| mangabay                                  | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| mangabolt                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangack                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| mangacloud                                | standalone    | blocked | API answers 409 until a WebView posts a Turnstile token                                                                                                                                                                                                                                                                                       |
| mangade                                   | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangademon                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangafox                                  | standalone    | done    | mobile roll_manga reader                                                                                                                                                                                                                                                                                                                      |
| mangafreak                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangago                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| mangahen                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangahere                                 | standalone    | done    | JS p.a.c.k.e.r unpacker in src/packer.ts                                                                                                                                                                                                                                                                                                      |
| mangakatana                               | standalone    | done    | images are octet-stream: empty transformImage lets the host sniff them                                                                                                                                                                                                                                                                        |
| mangalix                                  | standalone    | done    | catalog parsed from the main script's JS literal; per-series /chapters/<slug>.json (the .gz archive is gone)                                                                                                                                                                                                                                  |
| mangamelon                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangamirai                                | standalone    | blocked | service shutting down (15 Dec 2026, moving to MangaPlaza); catalog/search removed                                                                                                                                                                                                                                                             |
| mangamo                                   | standalone    | done    | anonymous Firebase account + Firestore REST; newest chapters need a subscription                                                                                                                                                                                                                                                              |
| mangamob                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangapdf                                  | standalone    | blocked | probe 2026-10-03: http:521                                                                                                                                                                                                                                                                                                                    |
| mangapill                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangaplaza                                | standalone    | ported  | in pending/: needs per-chapter CloudFront signed cookies from several Set-Cookie headers, but the runtime's http response keeps only the last one (fromFetchResponse overwrites duplicates; use headers.getSetCookie()). Code complete (ptbinb descrambler verified on a real page); signed params go in the url once all cookies are visible |
| mangarawclub                              | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangareadercc                             | standalone    | blocked | probe 2026-10-03: http:526                                                                                                                                                                                                                                                                                                                    |
| mangatown                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangauno                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mangayi                                   | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhuarush                                | standalone    | blocked | probe 2026-10-03: http:404                                                                                                                                                                                                                                                                                                                    |
| manhwa18                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhwabuddy                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhwalike                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| manhwaread                                | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| manhwazone                                | standalone    | done    | manhwatop CDN 403s Node's TLS (mr-ext smoke) but serves curl/Chromium with Referer manhwatop.com                                                                                                                                                                                                                                              |
| megatokyo                                 | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| mehgazone                                 | standalone    | done    | WordPress app-password preferences; excerpt text page not ported                                                                                                                                                                                                                                                                              |
| mgreadio                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| mlbblore                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| multporn                                  | standalone    | done    | gallery is inside <noscript>; re-parsed                                                                                                                                                                                                                                                                                                       |
| myadultcomics                             | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| myhentaicomics                            | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| myhentaigallery                           | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| newmanhwa                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| ninehentai                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| ninekon                                   | standalone    | blocked | rebranded to doujum.com, a different app (2026-10-03)                                                                                                                                                                                                                                                                                         |
| nixmanga                                  | standalone    | blocked | probe 2026-10-03: http:521                                                                                                                                                                                                                                                                                                                    |
| nuviatoon                                 | standalone    | blocked | origin down: HTTP 522 (2026-10-03)                                                                                                                                                                                                                                                                                                            |
| nuxscans                                  | standalone    | ported  | in pending/: the site's oldest chapter post is a 404 and chapters 147/148 share a url (2026-10-03)                                                                                                                                                                                                                                            |
| oglaf                                     | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| ohjoysextoy                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| omoi                                      | standalone    | done    | pages XORed with 174 in transformImage; newest chapters are paid                                                                                                                                                                                                                                                                              |
| onepunchmanonline                         | standalone    | done    | singleseries; site moved to w20.1punchman.com; newest chapter has only a placeholder image                                                                                                                                                                                                                                                    |
| onlythebesthentai                         | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| oots                                      | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| oppaistream                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| patchfriday                               | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| philiascans                               | standalone    | done    | page DRM (aesctr4/aesctr/chacha/xor + tile shuffle) decrypted in transformImage; newest chapters are paid                                                                                                                                                                                                                                     |
| porncomix                                 | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| pornhwa18                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| questionablecontent                       | standalone    | done    | singleseries; author's-notes text page not ported                                                                                                                                                                                                                                                                                             |
| randowiz                                  | standalone    | blocked | probe 2026-10-03: http:403                                                                                                                                                                                                                                                                                                                    |
| readallcomicscom                          | standalone    | blocked | probe 2026-10-03: http:522                                                                                                                                                                                                                                                                                                                    |
| readcomiconline                           | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| readhorimiyaonline                        | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| readvagabondmanga                         | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| reallifecomics                            | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| reimanga                                  | standalone    | ported  | in pending/: chapter and reader pages are behind a Cloudflare challenge (API only covers lists/details)                                                                                                                                                                                                                                       |
| revivalscans                              | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| rinkocomics                               | standalone    | done    | newest chapters are paid (live smoke stops at getPages)                                                                                                                                                                                                                                                                                       |
| sabrinaonline                             | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| sacachispa                                | standalone    | done    | newest chapters can be Patreon-exclusive (the site says so)                                                                                                                                                                                                                                                                                   |
| saturdaymorningbreakfastcomics            | standalone    | done    | singleseries; hover-text page and bundled thumbnail not ported                                                                                                                                                                                                                                                                                |
| scansgg                                   | standalone    | done    | test picks the first popular series with chapters                                                                                                                                                                                                                                                                                             |
| schlockmercenary                          | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| silentquill                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| sirenscans                                | standalone    | done    | CDN serves JPEGs as text/plain: empty transformImage                                                                                                                                                                                                                                                                                          |
| solarandsundry                            | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| spyfakku                                  | standalone    | blocked | probe 2026-10-03: dead:no-baseUrl                                                                                                                                                                                                                                                                                                             |
| stonescape                                | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| sunshinebutterflyscans                    | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| supermega                                 | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| swordscomic                               | standalone    | done    | singleseries; title-text page not ported                                                                                                                                                                                                                                                                                                      |
| tapastic                                  | standalone    | done    | newest episodes are paid (smoke stops at getPages); author's-note text pages not ported                                                                                                                                                                                                                                                       |
| tcbscans                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| teamshadowi                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| templescan                                | standalone    | blocked | every page redirects to a Cloudflare Turnstile /challenge                                                                                                                                                                                                                                                                                     |
| theduckwebcomics                          | standalone    | done    | 18+ comics need a login; live runner picks the #1 comic, which currently is one                                                                                                                                                                                                                                                               |
| thegirlfromrandomchattingmangaonline      | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| thepropertyofhate                         | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| todaymanga                                | standalone    | blocked | probe 2026-10-03: http:502                                                                                                                                                                                                                                                                                                                    |
| toonz                                     | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| vgperson                                  | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| visionhaze                                | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| vixenlogic                                | standalone    | done    | singleseries                                                                                                                                                                                                                                                                                                                                  |
| vizshonenjump                             | standalone    | blocked | geo-blocked: redirects to /shonenjump (not available in this country); descrambler is portable (EXIF key + rect tiles)                                                                                                                                                                                                                        |
| voyceme                                   | standalone    | ported  | in pending/: graphql.voyce.me still answers 503 (retried 2026-10-04)                                                                                                                                                                                                                                                                          |
| vyvymanga                                 | standalone    | blocked | probe 2026-10-03: http:503                                                                                                                                                                                                                                                                                                                    |
| warforrayuba                              | standalone    | done    | pages via Imgur's album API (Cubari proxy gone); newest album deleted on Imgur                                                                                                                                                                                                                                                                |
| webdexscans                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| webnovel                                  | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| weebcentral                               | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| xlecx                                     | standalone    | done    | some posts need an account; live runner picks the #1 post, which currently does (test skips such posts)                                                                                                                                                                                                                                       |
| xomanga                                   | standalone    | blocked | probe 2026-10-03: cloudflare                                                                                                                                                                                                                                                                                                                  |
| xyzcomics                                 | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| yaoihot                                   | standalone    | done    |                                                                                                                                                                                                                                                                                                                                               |
| yorai                                     | standalone    | blocked | domain parked for sale (2026-10-03)                                                                                                                                                                                                                                                                                                           |

## de

| Extension | Theme      | Status | Notes                                                               |
| --------- | ---------- | ------ | ------------------------------------------------------------------- |
| mangatube | standalone | done   | solves the site's arithmetic challenge (cookie __mtbpass); JSON API |

## pl

| Extension | Theme      | Status | Notes                                        |
| --------- | ---------- | ------ | -------------------------------------------- |
| mangahona | standalone | done   | JSON API; whole catalog filtered client-side |

## cs

| Extension      | Theme         | Status  | Notes                        |
| -------------- | ------------- | ------- | ---------------------------- |
| evilproduction | mangathemesia | blocked | probe 2026-10-04: cloudflare |

## bg

| Extension  | Theme  | Status  | Notes                                             |
| ---------- | ------ | ------- | ------------------------------------------------- |
| utsukushii | mmrcms | blocked | probe 2026-10-04: dead:connect timeout (curl too) |

## ca

| Extension        | Theme      | Status | Notes |
| ---------------- | ---------- | ------ | ----- |
| fansubscat       | fansubscat | done   |       |
| fansubscathentai | fansubscat | done   |       |

## ko

| Extension  | Theme      | Status  | Notes                                                                                                             |
| ---------- | ---------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| blacktoon  | standalone | done    | domain redirect followed (blacktoon.me → current); full catalog from webtoon_N.js filtered client-side            |
| manatoki   | standalone | blocked | domain rotates (manatoki5xx.net, address portal is JS-driven); no live domain found                               |
| navercomic | standalone | done    | 3 sources (webtoon, best challenge, challenge)                                                                    |
| rawdex     | standalone | done    |                                                                                                                   |
| toon11     | standalone | done    | filters can't combine with a search query                                                                         |
| toonkor    | standalone | done    | domain rotates (toonkor1.org now); desktop UA needed for the full listing                                         |
| wolfdotcom | standalone | done    | webtoon + comic; domain rotation followed from the notice page; EUC-KR codec; photo section removed from the site |

## uk

| Extension  | Theme      | Status | Notes                                                                                                              |
| ---------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| comixtopia | standalone | done   | supabase REST; pages re-fetched from issues.image_list                                                             |
| dgmanga    | standalone | done   | JSON api; hidden genres + licensed prefs                                                                           |
| faust      | standalone | done   | unauthenticated API only; 18+ chapters need a site login; hidden-genre pref by genre name                          |
| honeymanga | standalone | done   | api filters; hidden genres/types from prefs applied as exclusions                                                  |
| mangainua  | standalone | done   | DLE ajax chapters/pages via site_login_hash                                                                        |
| mangarama  | madara     | ported | in pending/: media.mangarama.com.ua answers 403 (Cloudflare) to signed page urls from here; rest of the flow works |
| zenko      | standalone | done   | api; hidden genres/categories/age prefs                                                                            |

## it

| Extension           | Theme         | Status  | Notes                                                        |
| ------------------- | ------------- | ------- | ------------------------------------------------------------ |
| animegdrclub        | standalone    | done    | site content is from 2024 (still answers)                    |
| ddtteam             | pizzareader   | blocked | probe 2026-10-04: Cloudflare 403                             |
| digitalteam         | standalone    | blocked | probe 2026-10-04: dead:ENOTFOUND                             |
| gto                 | pizzareader   | done    |                                                              |
| hastateam           | pizzareader   | blocked | probe 2026-10-04: Cloudflare 403                             |
| hentaiarchive       | standalone    | done    | each post is a single chapter                                |
| hentaifantasy       | standalone    | done    | series listed once per recent chapter: deduplicated          |
| juinjutsuteamreader | foolslide     | done    | search overridden (site lists results in div.series_element) |
| lupiteam            | pizzareader   | done    |                                                              |
| mangaworld          | mangaworld    | done    |                                                              |
| mangaworldadult     | mangaworld    | done    |                                                              |
| nifteam             | foolslide     | done    |                                                              |
| phoenixscans        | pizzareader   | done    |                                                              |
| tuttoanimemanga     | pizzareader   | done    |                                                              |
| walpurgisscan       | mangathemesia | blocked | probe 2026-10-04: http:503 'Accesso Limitato'                |
| zeurelscan          | standalone    | blocked | probe 2026-10-04: dead:connect timeout                       |

## ru

| Extension     | Theme      | Status  | Notes                                                                                                                                                                      |
| ------------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| acomics       | standalone | done    | filters read from /comics; age rating cookie sent                                                                                                                          |
| allhentai     | grouple    | done    | no auto-login; every popular series is adult and answers 404 to guests, so the fixture test accepts the login error for getPages (chapter list, details, filters verified) |
| astramanga    | standalone | done    |                                                                                                                                                                            |
| comx          | standalone | blocked | site guard (/_c) needs a browser-run proof-of-work/fingerprint challenge (WebView in Tachiyomi)                                                                            |
| desu          | standalone | done    | popular/latest use order_by popular/updated (Tachiyomi sends neither); filters added; page images need a Referer                                                           |
| henchan       | multichan  | done    | popular uses the favourites order of /manga/newest (/mostfavorites shows a maintenance page; /manga/new is 404)                                                            |
| hentailib     | libgroup   | blocked | probe 2026-10-05: http:403 (site returns a 404 page)                                                                                                                       |
| inkstory      | inkstory   | done    | only api.inuko.me is used (inkstory.net itself is behind DDoS-Guard); XOR image decryption via transformImage                                                              |
| mangabuff     | standalone | blocked | probe 2026-10-05: DDoS-Guard 403                                                                                                                                           |
| mangachan     | multichan  | done    | tag listing ids use underscores                                                                                                                                            |
| mangahub      | standalone | done    | package/manifest id mangahub-ru (ar/mangahub exists)                                                                                                                       |
| mangalib      | libgroup   | blocked | probe 2026-10-05: Cloudflare 1020 block                                                                                                                                    |
| mangamen      | standalone | blocked | probe 2026-10-05: http:403                                                                                                                                                 |
| mangapoisk    | standalone | done    |                                                                                                                                                                            |
| mangashi      | standalone | done    |                                                                                                                                                                            |
| mintmanga     | grouple    | done    | no auto-login; every popular series is adult and answers 404 to guests, so the fixture test accepts the login error for getPages (chapter list, details, filters verified) |
| ninegrid      | standalone | done    | API key preference only for progress tracking                                                                                                                              |
| nudemoon      | standalone | blocked | probe 2026-10-05: Cloudflare challenge                                                                                                                                     |
| puremanga     | inkstory   | done    | XOR image decryption via transformImage                                                                                                                                    |
| readmanga     | grouple    | done    | no auto-login: series gated for guests (404) can't be read, e.g. the top popular ones; the fixture test uses the first popular series that opens                           |
| seimanga      | grouple    | done    | no auto-login: series gated for guests (404) can't be read, e.g. the top popular ones; the fixture test uses the first popular series that opens                           |
| selfmanga     | grouple    | done    | no auto-login: series gated for guests (404) can't be read, e.g. the top popular ones; the fixture test uses the first popular series that opens                           |
| senkognito    | senkuro    | done    | senkognito.com mirror; no latest                                                                                                                                           |
| senkuro       | senkuro    | done    | senkuro.com mirror (senkuro.me is behind DDoS-Guard); no latest, as in Tachiyomi; no resolveUrl (ids are not in web urls)                                                  |
| slashlib      | libgroup   | blocked | probe 2026-10-05: Cloudflare challenge                                                                                                                                     |
| tomilolib     | standalone | done    | no resolveUrl (the api needs the title id, the site urls carry the slug)                                                                                                   |
| unicomics     | standalone | done    | text search goes through Yandex site search (can show a captcha)                                                                                                           |
| usagi         | grouple    | done    | no auto-login: series gated for guests (404) can't be read, e.g. the top popular ones; the fixture test uses the first popular series that opens                           |
| wamanga       | standalone | done    | SvelteKit __data.json (devalue) decoded in TS; detail responses stream extra lines, only the first is parsed                                                               |
| yagamiproject | standalone | blocked | probe 2026-10-05: connection times out                                                                                                                                     |
| yaoichan      | multichan  | blocked | probe 2026-10-05: connection times out                                                                                                                                     |

## th

| Extension       | Theme         | Status  | Notes                                                                               |
| --------------- | ------------- | ------- | ----------------------------------------------------------------------------------- |
| cat300          | madara        | done    |                                                                                     |
| doodmanga       | madara        | blocked | probe 2026-10-04: Cloudflare 403                                                    |
| doujinlc        | madara        | blocked | probe 2026-10-04: Cloudflare 403                                                    |
| doujinmoon      | mangathemesia | done    |                                                                                     |
| doujinza        | madara        | blocked | series pages time out (>40 s, also via curl); retry later                           |
| ecchidoujin     | mangathemesia | done    |                                                                                     |
| finmanga        | mangathemesia | done    |                                                                                     |
| goddoujin       | mangathemesia | done    |                                                                                     |
| gomanga         | mangathemesia | done    |                                                                                     |
| makimaaaaa      | mangathemesia | blocked | /manga/ listing answers 404 (site changed; series pages still at /manga/<slug>/)    |
| manga168        | mangathemesia | blocked | probe 2026-10-04: dead:ECONNRESET                                                   |
| mangablackcat   | standalone    | done    |                                                                                     |
| mangaisekaithai | madara        | done    | descrambling (packed script + tile matrix) ported but no scrambled page seen        |
| mangakimi       | mangathemesia | blocked | probe 2026-10-04: Cloudflare 403                                                    |
| mangalc         | madara        | done    |                                                                                     |
| mangastep       | mangathemesia | done    |                                                                                     |
| manhuabug       | madara        | blocked | probe 2026-10-04: Cloudflare 403                                                    |
| manhuathai      | madara        | blocked | probe 2026-10-04: Cloudflare 403                                                    |
| manhwabreakup   | madara        | blocked | probe 2026-10-04: Cloudflare 403                                                    |
| mikudoujin      | standalone    | blocked | probe 2026-10-04: Cloudflare 403                                                    |
| nekopost        | standalone    | done    | chapter pages decrypted (CryptoJS AES, EVP_BytesToKey MD5)                          |
| niceoppai       | standalone    | done    | test uses the 2nd popular entry (the site's first, Naruto, has no chapters)         |
| ntrmanga        | mangathemesia | done    |                                                                                     |
| oremanga        | zmanga        | done    |                                                                                     |
| reapertrans     | mangathemesia | done    |                                                                                     |
| singmanga       | mangathemesia | blocked | probe 2026-10-04: Cloudflare 403                                                    |
| slowmanga       | mangathemesia | ported  | in pending/: image CDN img*.sing-manga.com answers a Cloudflare 403 (also via curl) |
| sodsaime        | mangathemesia | done    |                                                                                     |
| speedmanga      | mangathemesia | done    |                                                                                     |
| tanukimanga     | mangathemesia | done    |                                                                                     |
| toomtammanga    | mangathemesia | done    |                                                                                     |

## ar

| Extension         | Theme         | Status  | Notes                                                                                                    |
| ----------------- | ------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| anyonemanga       | madara        | blocked | Cloudflare challenge (manga pages)                                                                       |
| arabhentai        | standalone    | blocked | arabhentai.net now redirects to mangabab.com (different site); Tachiyomi source outdated                 |
| arabmanhwa        | madara        | blocked | site redesigned (no longer Madara); Tachiyomi source outdated                                            |
| arabshentai       | standalone    | blocked | Cloudflare challenge                                                                                     |
| arabtoons         | madara        | blocked | site under maintenance (503)                                                                             |
| arbxcomix         | madara        | done    | chapters carry no dates on the site                                                                      |
| areamanga         | mangathemesia | blocked | Cloudflare challenge                                                                                     |
| ariatoon          | standalone    | done    | chapter list limited to the first 100 (as in Tachiyomi)                                                  |
| azora             | iken          | done    |                                                                                                          |
| comicverse        | zeistmanga    | done    |                                                                                                          |
| despairmanga      | mangathemesia | done    | moved to despair-world.com                                                                               |
| detectiveconanar  | madara        | blocked | Cloudflare challenge                                                                                     |
| dilar             | standalone    | blocked | responses are ECIES encrypted (ECDH + HKDF + AES-GCM), which the extension sandbox cannot do             |
| duskoryvile       | standalone    | blocked | needs an account (login interceptor) and answers 406 to anonymous requests                               |
| empirewebtoon     | madara        | blocked | Cloudflare challenge (manga pages)                                                                       |
| eshadow           | standalone    | done    | series without chapters exist; test picks one with chapters                                              |
| goonscans         | mangathemesia | done    | site search ignores the title (listing only); test uses a series with chapters                           |
| hentailek         | standalone    | done    | Arabic chapter dates parsed locally (arabic-date.ts)                                                     |
| hentaiman         | standalone    | blocked | connection times out (dead?)                                                                             |
| hentaislayer      | fuzzydoodle   | done    | new fuzzydoodle theme; latest-type preference                                                            |
| hijala            | mangathemesia | blocked | Cloudflare challenge                                                                                     |
| hizomanga         | madara        | done    |                                                                                                          |
| kawiimanga        | standalone    | done    | API needs a short-lived token fetched with the public app key                                            |
| lavascans         | mangathemesia | done    |                                                                                                          |
| lonertranslations | zeistmanga    | done    |                                                                                                          |
| manga3asq         | madara        | done    | Arabic chapter dates parsed locally (arabic-date.ts)                                                     |
| mangaailand       | zeistmanga    | done    |                                                                                                          |
| mangacloud        | standalone    | blocked | domain has no DNS record (dead)                                                                          |
| mangadar          | standalone    | blocked | Cloudflare challenge                                                                                     |
| mangahub          | zeistmanga    | blocked | moved to mangaxhentai.com, now a different (non-Blogger) site; Tachiyomi source outdated                 |
| mangalek          | madara        | blocked | Tachiyomi source has no baseUrl                                                                          |
| mangalink         | madara        | blocked | Cloudflare challenge (manga pages)                                                                       |
| mangalionz        | madara        | blocked | Cloudflare challenge (manga pages)                                                                       |
| mangaspark        | madara        | blocked | Cloudflare challenge (manga pages)                                                                       |
| mangastarz        | madara        | blocked | Cloudflare challenge (manga pages)                                                                       |
| mangaswat         | standalone    | done    | site at meshmanga.com                                                                                    |
| mangatales        | standalone    | done    | search is AES-encrypted (decrypted locally); only a status filter kept; test uses a series with chapters |
| mangatek          | standalone    | blocked | Cloudflare challenge                                                                                     |
| mangatime         | standalone    | done    | tRPC API                                                                                                 |
| mangatuk          | standalone    | done    | locked (coin) chapters left out                                                                          |
| manhatic          | madara        | blocked | moved to hentailek.com (same site as the hentailek extension)                                            |
| manhatok          | zeistmanga    | done    | image-host helper posts filtered; test picks a chapter that has pages                                    |
| murim             | zeistmanga    | blocked | connection times out (dead?)                                                                             |
| neverscans        | standalone    | blocked | TLS certificate error (dead?)                                                                            |
| oduto             | standalone    | done    | single-series Blogger site                                                                               |
| onma              | mmrcms        | done    | mmrcms                                                                                                   |
| orcamanga         | zeistmanga    | blocked | blog has series without chapters; the chapter pages found carry no images                                |
| paradisebl        | madara        | done    | chapters carry no dates on the site                                                                      |
| rocksmanga        | madara        | blocked | site under maintenance (title 'صيانة')                                                                   |
| stellarsaber      | standalone    | blocked | Cloudflare challenge                                                                                     |
| teamx             | standalone    | done    | site at olympustaff.com                                                                                  |
| xsanomanga        | zeistmanga    | done    |                                                                                                          |
| yokai             | zeistmanga    | done    |                                                                                                          |
| yonabar           | madara        | done    | image host rewrite follows the site's script (medium1xr)                                                 |
| yurimoonsub       | zeistmanga    | done    |                                                                                                          |

## fr

| Extension        | Theme         | Status  | Notes                                                                                                                                                                                     |
| ---------------- | ------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| animesama        | standalone    | blocked | Cloudflare 403                                                                                                                                                                            |
| aralosbd         | standalone    | done    |                                                                                                                                                                                           |
| astralmanga      | standalone    | blocked | Cloudflare challenge                                                                                                                                                                      |
| bananascan       | madara        | done    |                                                                                                                                                                                           |
| banchanscan      | standalone    | blocked | Cloudflare 403                                                                                                                                                                            |
| bigsolo          | standalone    | blocked | Cloudflare 403                                                                                                                                                                            |
| blossomscans     | standalone    | blocked | Cloudflare 403                                                                                                                                                                            |
| bluesolo         | pizzareader   | done    |                                                                                                                                                                                           |
| chaostrad        | standalone    | done    |                                                                                                                                                                                           |
| dassouscan       | standalone    | done    | premium chapters hidden by default (pref)                                                                                                                                                 |
| epsilonscan      | pam           | blocked | Cloudflare 403                                                                                                                                                                            |
| fmteam           | pizzareader   | done    |                                                                                                                                                                                           |
| furyosquad       | standalone    | done    |                                                                                                                                                                                           |
| hanabook         | standalone    | todo    |                                                                                                                                                                                           |
| hentaiorigines   | origines      | done    | theme origines ported                                                                                                                                                                     |
| hentaiscanreader | scanreader    | ported  | in pending/: o2switch Tiger Protect redirects the chapter-list POST until its o2s-chl cookie is sent back (redirect loop in the sandbox)                                                  |
| hentaiscantrad   | madara        | done    |                                                                                                                                                                                           |
| hentaizone       | madara        | blocked | Cloudflare 403                                                                                                                                                                            |
| histoiredhentai  | madara        | done    |                                                                                                                                                                                           |
| japscan          | standalone    | todo    |                                                                                                                                                                                           |
| kiwiyascans      | mangathemesia | blocked | 526 invalid SSL certificate                                                                                                                                                               |
| lanortrad        | standalone    | done    | series/chapters data read from the site's JS data files (keys quoted by scanning); resolveUrl only for manga.html?id= links                                                               |
| lelmanga         | mangathemesia | blocked | Cloudflare 403                                                                                                                                                                            |
| lelscan          | standalone    | done    | adapted to the redesigned reader (hot-series catalog, chapter dropdown in the header, page links); Tachiyomi selectors are outdated                                                       |
| lelscanvf        | fuzzydoodle   | blocked | Cloudflare 403                                                                                                                                                                            |
| lesporoiniens    | standalone    | done    | catalogue = config.json + one request per series file (rate limit raised to 30/s)                                                                                                         |
| mangacorporation | pizzareader   | done    |                                                                                                                                                                                           |
| mangahubfr       | madara        | done    | chapter images need a PHP session: made-up PHPSESSID sent with page and images                                                                                                            |
| mangakawaii      | standalone    | done    | test picks the first popular series with readable chapters (licensed ones list none)                                                                                                      |
| mangamoins       | standalone    | done    | API needs the mm_session cookie of a home visit sent with a Referer (re-visits until the host reports it)                                                                                 |
| manganova        | standalone    | blocked | API answers 403 "not available from your country" (geo-block); untestable from here                                                                                                       |
| mangascantrad    | madara        | blocked | Cloudflare challenge                                                                                                                                                                      |
| mangasoriginesfr | origines      | blocked | Cloudflare challenge                                                                                                                                                                      |
| ono              | standalone    | todo    |                                                                                                                                                                                           |
| ortegascans      | standalone    | todo    |                                                                                                                                                                                           |
| pantheonscan     | madara        | ported  | in pending/: the host's bot protection (o2switch Tiger Protect) redirects the chapter-list POST until its o2s-chl cookie is sent back; the sandbox has no cookie jar for redirects (loop) |
| perfscan         | loneseal      | blocked | domain has no DNS record (dead)                                                                                                                                                           |
| phenixscansco    | standalone    | blocked | Cloudflare 403                                                                                                                                                                            |
| pornhwafr        | mangathemesia | blocked | 522 connection timed out                                                                                                                                                                  |
| poseidonscans    | standalone    | done    | Next.js RSC (own finder: no depth limit); premium chapters hidden unless the pref is on                                                                                                   |
| raijinscans      | standalone    | todo    |                                                                                                                                                                                           |
| rimuscans        | standalone    | todo    |                                                                                                                                                                                           |
| scanhentaimenu   | madara        | blocked | Cloudflare challenge                                                                                                                                                                      |
| scanmanga        | standalone    | blocked | m.scan-manga.com answers 404                                                                                                                                                              |
| scanr            | standalone    | todo    |                                                                                                                                                                                           |
| scanreader       | scanreader    | done    | test falls back to the next chapter (duplicate oldest chapter returns 500 on the site)                                                                                                    |
| scansfr          | standalone    | todo    |                                                                                                                                                                                           |
| scantradunion    | standalone    | done    |                                                                                                                                                                                           |
| scanvf           | mmrcms        | done    | theme mmrcms ported                                                                                                                                                                       |
| sirenscansfr     | keyoapp       | blocked | domain has no DNS record (dead)                                                                                                                                                           |
| softepsilonscan  | pam           | blocked | Cloudflare 403                                                                                                                                                                            |
| solarisscans     | standalone    | blocked | 503 maintenance page                                                                                                                                                                      |
| sushiscan        | mangathemesia | blocked | Cloudflare 403                                                                                                                                                                            |
| sushiscanfr      | mangathemesia | blocked | catalogue answers 504 gateway time-out (ported config was fine: Statut/En cours override)                                                                                                 |
| toonfr           | madara        | blocked | Cloudflare challenge                                                                                                                                                                      |
| twatt            | standalone    | done    | api; many series have no images yet: test looks for the first popular series with pages; data: covers passed through                                                                      |
| yaoiscan         | mangathemesia | blocked | 504 gateway time-out                                                                                                                                                                      |

## zh

| Extension       | Theme      | Status  | Notes                                                                                                                      |
| --------------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| bakamh          | madara     | blocked | probe 2026-10-04: Cloudflare                                                                                               |
| baozimanhua     | standalone | todo    |                                                                                                                            |
| baozimhorg      | goda       | done    | mirrors: baozimh.org (first); api-get-v3 chapter list + decoded page list                                                  |
| bh3             | standalone | done    | no site search: search filters the book list                                                                               |
| bilimanga       | standalone | todo    |                                                                                                                            |
| boylove         | standalone | todo    |                                                                                                                            |
| cartoon18       | standalone | done    |                                                                                                                            |
| cmanhua         | standalone | done    | listing needs ASP.NET postbacks; image host manhua.5um.net sometimes unreachable (passed live once)                        |
| comicabc        | standalone | todo    |                                                                                                                            |
| creativecomic   | standalone | todo    |                                                                                                                            |
| dm5             | standalone | todo    |                                                                                                                            |
| dongmanmanhua   | standalone | done    | yields while parsing the 1.2 MB schedule page                                                                              |
| dumanwu         | mmlook     | blocked | probe 2026-10-04: dead (TLS certificate invalid)                                                                           |
| eighteenmanhua  | goda       | blocked | probe 2026-10-04: Cloudflare                                                                                               |
| favcomic        | standalone | todo    |                                                                                                                            |
| guazimanhua     | standalone | done    |                                                                                                                            |
| hanabimanga     | standalone | todo    |                                                                                                                            |
| hanime1         | standalone | done    |                                                                                                                            |
| hanman18        | manga18    | done    | tag filter removed (doesn't work on the site)                                                                              |
| hcomic          | standalone | done    | each comic is a single chapter                                                                                             |
| hentaiclub      | standalone | done    | every post is a single chapter                                                                                             |
| hikarinagi      | standalone | ported  | in pending/: the reader API answers 401 without a logged-in session                                                        |
| ikmmh           | standalone | todo    |                                                                                                                            |
| iqiyi           | standalone | todo    |                                                                                                                            |
| jcomic          | standalone | done    | chapter dates and author not kept                                                                                          |
| jinmantiantang  | standalone | blocked | probe 2026-10-04: Cloudflare                                                                                               |
| jiuermanhua     | sinmh      | blocked | probe 2026-10-04: Cloudflare                                                                                               |
| komiic          | standalone | todo    |                                                                                                                            |
| kuaikanmanhua   | standalone | todo    |                                                                                                                            |
| mangabz         | standalone | todo    |                                                                                                                            |
| mangaxiaosi     | standalone | done    |                                                                                                                            |
| manhuadui       | sinmh      | blocked | probe 2026-10-04: Cloudflare                                                                                               |
| manhuagui       | standalone | todo    |                                                                                                                            |
| manhuaren       | standalone | todo    |                                                                                                                            |
| manhuashe       | standalone | done    |                                                                                                                            |
| manhuawu        | mccms      | done    |                                                                                                                            |
| manwa           | standalone | blocked | probe 2026-10-04: Cloudflare                                                                                               |
| mh1234          | standalone | done    |                                                                                                                            |
| mh160           | standalone | todo    |                                                                                                                            |
| miaoqu          | mccms      | done    | site search answers 404: search filters the first 10 catalogue pages                                                       |
| mycomic         | standalone | blocked | probe 2026-10-04: Cloudflare                                                                                               |
| nnhanman        | standalone | done    |                                                                                                                            |
| noyacg          | standalone | todo    |                                                                                                                            |
| picacomic       | standalone | todo    |                                                                                                                            |
| roumanwu        | standalone | todo    |                                                                                                                            |
| rumanhua        | mmlook     | blocked | probe 2026-10-04: dead (TLS certificate invalid)                                                                           |
| sixmh           | mccms      | done    |                                                                                                                            |
| tencentcomics   | standalone | todo    |                                                                                                                            |
| terrahistoricus | standalone | done    |                                                                                                                            |
| tongli          | standalone | todo    |                                                                                                                            |
| toptoon         | standalone | ported  | in pending/: every chapter page (epView) redirects to the list without a logged-in session; age check passed with a cookie |
| vomic           | standalone | todo    |                                                                                                                            |
| wnacg           | standalone | todo    |                                                                                                                            |
| yidan           | standalone | blocked | probe 2026-10-04: dead:ENOTFOUND                                                                                           |
| zaimanhua       | standalone | todo    |                                                                                                                            |
| zazhimi         | standalone | done    | test uses the 2nd popular entry (the first is an advert search never finds)                                                |
| zerobyw         | standalone | todo    |                                                                                                                            |

## tr

| Extension         | Theme         | Status  | Notes                                       |
| ----------------- | ------------- | ------- | ------------------------------------------- |
| afroditscans      | uzaymanga     | done    | new uzaymanga theme (SvelteKit __data.json) |
| alucardscans      | standalone    | blocked | SSL handshake failed (525)                  |
| amangaplanet      | mangathemesia | todo    |                                             |
| anikiga           | madara        | todo    |                                             |
| araznovel         | standalone    | todo    |                                             |
| arcurafansub      | mangathemesia | blocked | Cloudflare challenge                        |
| asurascanstr      | madara        | blocked | domain has no DNS record (dead)             |
| caprazmanga       | madara        | blocked | TLS handshake fails (dead)                  |
| diamondfansub     | madara        | todo    |                                             |
| domalfansub       | madara        | blocked | Cloudflare block (403)                      |
| eldermanga        | uzaymanga     | done    | new uzaymanga theme (SvelteKit __data.json) |
| eskimangalar      | uzaymanga     | done    | new uzaymanga theme (SvelteKit __data.json) |
| gafeland          | mangathemesia | blocked | Cloudflare challenge                        |
| gaiatoon          | mangathemesia | blocked | Cloudflare challenge                        |
| garciamanga       | madara        | blocked | hosting account suspended                   |
| ghosthentai       | madara        | todo    |                                             |
| golgebahcesi      | standalone    | blocked | Cloudflare block (403)                      |
| hattorimanga      | standalone    | blocked | Cloudflare challenge                        |
| hattoriscans      | standalone    | blocked | Cloudflare challenge                        |
| hayalistic        | madara        | blocked | Cloudflare challenge                        |
| holyscans         | standalone    | todo    |                                             |
| juratempest       | standalone    | todo    |                                             |
| korelimanga       | initmanga     | todo    |                                             |
| koreliscans       | mangathemesia | todo    |                                             |
| kuroimanga        | madara        | blocked | Cloudflare challenge                        |
| laviniafansub     | madara        | todo    |                                             |
| limonmanga        | uzaymanga     | done    | new uzaymanga theme (SvelteKit __data.json) |
| lunascans         | madara        | todo    |                                             |
| mangadenizi       | standalone    | todo    |                                             |
| mangadiyari       | standalone    | todo    |                                             |
| mangadusleri      | standalone    | blocked | connection times out (dead)                 |
| mangakusu         | mangathemesia | blocked | Cloudflare challenge                        |
| mangaportali      | standalone    | todo    |                                             |
| mangasehrinet     | madara        | blocked | origin down (522)                           |
| mangaship         | standalone    | todo    |                                             |
| mangatilkisi      | madara        | todo    |                                             |
| mangatr           | standalone    | blocked | DDoS-Guard challenge                        |
| mangawow          | madara        | todo    |                                             |
| mangawt           | standalone    | blocked | Cloudflare challenge                        |
| mangazure         | madara        | blocked | origin down (522)                           |
| mangitto          | standalone    | todo    |                                             |
| merlinscans       | initmanga     | blocked | Cloudflare block (403)                      |
| mikrokosmosfansub | zeistmanga    | todo    |                                             |
| milasub           | madara        | todo    |                                             |
| monomanga         | standalone    | todo    |                                             |
| moondaisyscans    | mangathemesia | todo    |                                             |
| nemesisscans      | mangathemesia | todo    |                                             |
| nirvanamanga      | mangathemesia | todo    |                                             |
| niverafansub      | madara        | blocked | Cloudflare challenge                        |
| okutoon           | standalone    | todo    |                                             |
| opiatoon          | madara        | todo    |                                             |
| orimanga          | initmanga     | todo    |                                             |
| paradoxscans      | initmanga     | blocked | Cloudflare block (403)                      |
| patimanga         | mangathemesia | blocked | Cloudflare block (403)                      |
| ragnarscans       | initmanga     | todo    |                                             |
| raindropfansub    | mangathemesia | blocked | connection times out (dead)                 |
| ruyamanga         | madara        | todo    |                                             |
| sereinscan        | mangathemesia | todo    |                                             |
| shadowceviri      | zeistmanga    | todo    |                                             |
| shijiescans       | mangathemesia | todo    |                                             |
| siyahmelek        | initmanga     | blocked | moved to siyahmelek.my; check below         |
| sleptmanga        | standalone    | todo    |                                             |
| strayfansub       | madaralegacy  | todo    |                                             |
| summertoon        | madara        | todo    |                                             |
| sunsetmanga       | madara        | todo    |                                             |
| tarotscans        | mangathemesia | todo    |                                             |
| tenshimanga       | uzaymanga     | done    | new uzaymanga theme (SvelteKit __data.json) |
| tonizutoon        | madara        | todo    |                                             |
| toontaku          | standalone    | todo    |                                             |
| tortugaceviri     | madara        | todo    |                                             |
| trmanga           | standalone    | todo    |                                             |
| turkcemangaoku    | madara        | todo    |                                             |
| uzaymanga         | uzaymanga     | done    | new uzaymanga theme (SvelteKit __data.json) |
| webtoonhatti      | madara        | blocked | Cloudflare challenge                        |
| webtoonoku        | standalone    | todo    |                                             |
| yaoiflix          | madara        | todo    |                                             |
| yaoimangaoku      | madara        | blocked | Cloudflare challenge                        |

## vi

| Extension         | Theme      | Status | Notes |
| ----------------- | ---------- | ------ | ----- |
| ariverse          | standalone | todo   |       |
| cmanga            | standalone | todo   |       |
| cuutruyen         | standalone | todo   |       |
| cuutruyenmoe      | standalone | todo   |       |
| damconuong        | standalone | todo   |       |
| daomeoden         | standalone | todo   |       |
| dilib             | standalone | todo   |       |
| doctruyen3q       | wpcomics   | todo   |       |
| doctruyen5s       | liliana    | todo   |       |
| dualeotruyen      | standalone | todo   |       |
| fastscan          | standalone | todo   |       |
| gantzvn           | madara     | todo   |       |
| goctruyentranh    | standalone | todo   |       |
| goctruyentranhvui | standalone | todo   |       |
| hentaicube        | madara     | todo   |       |
| hentaivnplus      | madara     | todo   |       |
| hentaivnx         | standalone | todo   |       |
| hv2tcomics        | standalone | todo   |       |
| kamicomic         | standalone | todo   |       |
| khomanhwa         | standalone | todo   |       |
| kirakira          | standalone | todo   |       |
| loppytoon         | standalone | todo   |       |
| luottruyen        | standalone | todo   |       |
| luvevaland        | standalone | todo   |       |
| lxhentai          | standalone | todo   |       |
| lxmangaorg        | standalone | todo   |       |
| medamtruyen       | standalone | todo   |       |
| mehentai          | manhwaz    | todo   |       |
| meosss            | standalone | todo   |       |
| meosua            | standalone | todo   |       |
| metruyen18        | madara     | todo   |       |
| mimi              | standalone | todo   |       |
| mimihentai        | standalone | todo   |       |
| minotruyen        | standalone | todo   |       |
| moetruyen         | standalone | todo   |       |
| moetruyensuicao   | standalone | todo   |       |
| nettruyenco       | wpcomics   | todo   |       |
| nettruyens        | standalone | todo   |       |
| nettruyenviet     | standalone | todo   |       |
| nettruyenx        | wpcomics   | todo   |       |
| nhattruyen        | wpcomics   | todo   |       |
| nhentaiclub       | standalone | todo   |       |
| otakusic          | standalone | todo   |       |
| otruyen           | standalone | todo   |       |
| panomic           | standalone | todo   |       |
| sangchanhteam     | standalone | todo   |       |
| sayhentai         | manhwaz    | todo   |       |
| seikowo           | standalone | todo   |       |
| sinhsieusao       | standalone | todo   |       |
| soaicacomic       | standalone | todo   |       |
| teamlanhlung      | standalone | todo   |       |
| teletruyen        | standalone | todo   |       |
| thienthaitruyen   | standalone | todo   |       |
| thohamngu         | standalone | todo   |       |
| toptruyen         | wpcomics   | todo   |       |
| tranh18           | standalone | todo   |       |
| truyen18          | standalone | todo   |       |
| truyengg          | standalone | todo   |       |
| truyenggvn        | standalone | todo   |       |
| truyenhentai18    | standalone | todo   |       |
| truyenhentaivn    | standalone | todo   |       |
| truyenhentaiz     | standalone | todo   |       |
| truyenmm          | standalone | todo   |       |
| truyenqq          | standalone | todo   |       |
| truyenqqvn        | standalone | todo   |       |
| truyentini        | madara     | todo   |       |
| truyentranhdammy  | madara     | todo   |       |
| truyentuoitho     | madara     | todo   |       |
| truyentvn         | standalone | todo   |       |
| tuitruyen         | standalone | todo   |       |
| tusachxinhxinh    | standalone | todo   |       |
| umetruyen         | manhwaz    | todo   |       |
| vihentai          | standalone | todo   |       |
| vinahentai        | standalone | todo   |       |
| vitruyen          | standalone | todo   |       |
| yurigarden        | standalone | todo   |       |
| yurineko          | standalone | todo   |       |
| zettruyen         | standalone | todo   |       |

## es

| Extension             | Theme         | Status | Notes |
| --------------------- | ------------- | ------ | ----- |
| akaya                 | standalone    | todo   |       |
| anzmanga              | mmrcms        | todo   |       |
| apollcomics           | madara        | todo   |       |
| asialotus             | mangathemesia | todo   |       |
| barmanga              | madara        | todo   |       |
| begatranslation       | madara        | todo   |       |
| bloomscans            | mangathemesia | todo   |       |
| bokugentranslation    | mangathemesia | todo   |       |
| bymichiscan           | mangathemesia | todo   |       |
| capibaratraductor     | standalone    | todo   |       |
| catharsisworld        | standalone    | todo   |       |
| catmanhwas            | standalone    | todo   |       |
| celestialmoon         | mangathemesia | todo   |       |
| cerberusseries        | mangathemesia | todo   |       |
| chochox               | vercomics     | todo   |       |
| codearc               | standalone    | todo   |       |
| colorcitoscan         | standalone    | todo   |       |
| darkroomfansub        | zeistmanga    | todo   |       |
| datgarscanlation      | zeistmanga    | todo   |       |
| doujinhentai          | standalone    | todo   |       |
| doujinshell           | madara        | todo   |       |
| dragontranslationorg  | madara        | todo   |       |
| dynasty               | standalone    | todo   |       |
| emperorscan           | madara        | todo   |       |
| enchiladascan         | standalone    | todo   |       |
| esmi2manga            | madara        | todo   |       |
| eternalmangas         | iken          | todo   |       |
| gistamishouse         | zeistmanga    | todo   |       |
| gremorymangas         | madara        | todo   |       |
| hadesnofansub         | madara        | todo   |       |
| haremdekira           | madara        | todo   |       |
| heavenmanga           | standalone    | todo   |       |
| hentaihall            | standalone    | todo   |       |
| hentaimode            | standalone    | todo   |       |
| houseofotakus         | madara        | todo   |       |
| ikigaimangas          | standalone    | todo   |       |
| ikuhentai             | standalone    | todo   |       |
| infrafandub           | madara        | todo   |       |
| inmanga               | standalone    | todo   |       |
| inmortalscan          | madara        | todo   |       |
| insanosscan           | standalone    | todo   |       |
| inventariooculto      | madara        | todo   |       |
| jeazscans             | standalone    | todo   |       |
| kazokuden             | madara        | todo   |       |
| koinoboriscan         | standalone    | todo   |       |
| lectorasteria         | moonlighttl   | todo   |       |
| lectorjpg             | standalone    | todo   |       |
| lectormangalat        | standalone    | todo   |       |
| lectormonline         | standalone    | todo   |       |
| leercapitulo          | standalone    | todo   |       |
| leermangaesp          | standalone    | todo   |       |
| leermanhwas           | standalone    | todo   |       |
| lmtoonline            | standalone    | todo   |       |
| lolivault             | foolslide     | todo   |       |
| lunapieces            | mangathemesia | todo   |       |
| mangacrab             | standalone    | todo   |       |
| mangamx               | standalone    | todo   |       |
| mangaromance          | madara        | todo   |       |
| mangashiina           | mangathemesia | todo   |       |
| mangasin              | mmrcms        | todo   |       |
| mangasnosekai         | madara        | todo   |       |
| mangatv               | mangathemesia | todo   |       |
| manhuaonline          | madara        | todo   |       |
| manhwalatino          | madara        | todo   |       |
| manhwaonline          | madara        | todo   |       |
| manhwaweb             | standalone    | todo   |       |
| mantrazscan           | standalone    | todo   |       |
| marmota               | madara        | todo   |       |
| menudofansub          | foolslide     | todo   |       |
| mhscans               | madara        | todo   |       |
| monopolyscan          | madara        | todo   |       |
| mundomanhwa           | madara        | todo   |       |
| nartag                | standalone    | todo   |       |
| nekoscans             | mangathemesia | todo   |       |
| neomanga              | standalone    | todo   |       |
| nexusscanlation       | standalone    | todo   |       |
| novamanhwa            | mangathemesia | todo   |       |
| olympusscanlation     | standalone    | todo   |       |
| onfmangas             | standalone    | todo   |       |
| orckumangas           | standalone    | todo   |       |
| platinumlilyscan      | standalone    | todo   |       |
| plottwistnofansub     | standalone    | todo   |       |
| ragnarokscanlation    | madara        | todo   |       |
| ragnascans            | standalone    | todo   |       |
| ravenmanga            | standalone    | todo   |       |
| richtoscan            | madara        | todo   |       |
| sapphirescan          | zeistmanga    | todo   |       |
| shadowmanga           | standalone    | todo   |       |
| skymangas             | mangathemesia | todo   |       |
| spicyscan             | standalone    | todo   |       |
| submanhwa             | standalone    | todo   |       |
| taurusfansub          | madara        | todo   |       |
| templescanesp         | madara        | todo   |       |
| tenkaiscan            | standalone    | todo   |       |
| tmohentaiunoriginal   | standalone    | todo   |       |
| toones                | madara        | todo   |       |
| topcomicporno         | madara        | todo   |       |
| topcomicpornonet      | madara        | todo   |       |
| traduccionesmoonlight | moonlighttl   | todo   |       |
| tumanhwasclub         | standalone    | todo   |       |
| uchuujinprojects      | mangathemesia | todo   |       |
| vcpvmp                | vercomics     | todo   |       |
| vermanhwas            | madara        | todo   |       |
| yupmanga              | standalone    | todo   |       |
| yurionline            | madara        | todo   |       |
| zonatmoorgunoriginal  | standalone    | todo   |       |
| zonatmoto             | standalone    | todo   |       |

## pt

| Extension           | Theme         | Status | Notes |
| ------------------- | ------------- | ------ | ----- |
| acervoeremita       | standalone    | todo   |       |
| acervohentai        | madara        | todo   |       |
| amuy                | madara        | todo   |       |
| animexnovel         | standalone    | todo   |       |
| apecomics           | mangawork     | todo   |       |
| apenasumafa         | zeistmanga    | todo   |       |
| argoscomics         | standalone    | todo   |       |
| argosscan           | standalone    | todo   |       |
| arthurscan          | madara        | todo   |       |
| astratoons          | standalone    | todo   |       |
| azuretoons          | standalone    | todo   |       |
| bakai               | standalone    | todo   |       |
| blackoutcomics      | standalone    | todo   |       |
| bladetoons          | mangotheme    | todo   |       |
| borutoexplorer      | madara        | todo   |       |
| brasilhentai        | standalone    | todo   |       |
| bryaoi              | standalone    | todo   |       |
| cafecomyaoi         | madara        | todo   |       |
| cerisescans         | standalone    | todo   |       |
| covenscan           | madara        | todo   |       |
| egotoons            | standalone    | todo   |       |
| erosect             | standalone    | todo   |       |
| euphoriascan        | madara        | todo   |       |
| exhentainetbr       | standalone    | todo   |       |
| fenixproject        | madara        | todo   |       |
| fleurblanche        | madara        | todo   |       |
| flowermanga         | madara        | todo   |       |
| galaxscanlator      | zeistmanga    | todo   |       |
| geasscomics         | standalone    | todo   |       |
| ghostscan           | madara        | todo   |       |
| hanmokkuscan        | zeistmanga    | todo   |       |
| hentaiseason        | gattsu        | todo   |       |
| hentaitokyo         | gattsu        | todo   |       |
| hipercool           | hiper         | todo   |       |
| hipertoon           | hiper         | todo   |       |
| horahentai          | standalone    | todo   |       |
| hotcabaretscan      | madara        | todo   |       |
| hqnow               | standalone    | todo   |       |
| huntersscans        | madara        | todo   |       |
| imperiodabritannia  | mangotheme    | todo   |       |
| inkapk              | madara        | todo   |       |
| kamisamaexplorer    | madara        | todo   |       |
| kivaratoons         | standalone    | todo   |       |
| kuromangas          | standalone    | todo   |       |
| leitordemangas      | aurora        | todo   |       |
| leituramanga        | standalone    | todo   |       |
| ler999              | zeistmanga    | todo   |       |
| littletyrant        | madara        | todo   |       |
| lycantoons          | standalone    | todo   |       |
| maidscan            | greenshit     | todo   |       |
| mangadash           | standalone    | todo   |       |
| mangaflix           | standalone    | todo   |       |
| mangalivre          | standalone    | todo   |       |
| mangalivreblog      | standalone    | todo   |       |
| mangalivreorg       | standalone    | todo   |       |
| mangalivreto        | madara        | todo   |       |
| manganyx            | aurora        | todo   |       |
| mangaonline         | standalone    | todo   |       |
| mangasbrasuka       | aurora        | todo   |       |
| mangastop           | standalone    | todo   |       |
| mangeek             | standalone    | todo   |       |
| mangotoons          | mangotheme    | todo   |       |
| manhastro           | standalone    | todo   |       |
| mediocretoons       | standalone    | todo   |       |
| minitwoscan         | madara        | todo   |       |
| montetai            | madara        | todo   |       |
| mrtenzus            | madara        | todo   |       |
| mugiwarasoficial    | aurora        | todo   |       |
| muitohentai         | standalone    | todo   |       |
| mundohentai         | standalone    | todo   |       |
| nebulosascan        | madara        | todo   |       |
| ninjascan           | madara        | todo   |       |
| nocturnesummer      | madara        | todo   |       |
| noindexscan         | madara        | todo   |       |
| onereader           | standalone    | todo   |       |
| osakascan           | zeistmanga    | todo   |       |
| pinkrosa            | zeistmanga    | todo   |       |
| pinkseaunicorn      | madara        | todo   |       |
| pizzariascan        | mangawork     | todo   |       |
| plumacomics         | standalone    | todo   |       |
| pointzerotoons      | mangathemesia | todo   |       |
| portalyaoi          | madara        | todo   |       |
| randomscan          | standalone    | todo   |       |
| remangas            | standalone    | todo   |       |
| revistasequadrinhos | standalone    | todo   |       |
| rfdragonscan        | standalone    | todo   |       |
| risentoons          | standalone    | todo   |       |
| roxinha             | standalone    | todo   |       |
| saikaiscan          | standalone    | todo   |       |
| shiraiscans         | standalone    | todo   |       |
| slimereadunoriginal | standalone    | todo   |       |
| spectralscan        | standalone    | todo   |       |
| sssscanlator        | standalone    | todo   |       |
| starlightscan       | mangathemesia | todo   |       |
| taimumangas         | standalone    | todo   |       |
| taiyo               | standalone    | todo   |       |
| tankouhentai        | madara        | todo   |       |
| taosect             | standalone    | todo   |       |
| temakimangas        | zeistmanga    | todo   |       |
| tiamanhwa           | madara        | todo   |       |
| toonbr              | standalone    | todo   |       |
| traducoesdolipe     | zeistmanga    | todo   |       |
| tsundokutraducoes   | mangathemesia | todo   |       |
| universohentai      | gattsu        | todo   |       |
| vegitoons           | greenshit     | todo   |       |
| verdinha            | greenshit     | todo   |       |
| xxxyaoi             | madara        | todo   |       |
| yaoifanclub         | zeistmanga    | todo   |       |
| yomumangas          | standalone    | todo   |       |
| yugenmangas         | standalone    | todo   |       |
| yuriverso           | madara        | todo   |       |
| zettahq             | standalone    | todo   |       |

## ja

| Extension               | Theme            | Status | Notes |
| ----------------------- | ---------------- | ------ | ----- |
| alphapolis              | standalone       | todo   |       |
| amebamanga              | standalone       | todo   |       |
| asacomi                 | comiciviewer     | todo   |       |
| bibibicomic             | comiciviewer     | todo   |       |
| bigcomics               | comiciviewer     | todo   |       |
| booklistastudio         | comiciviewer     | todo   |       |
| bookwalkerjp            | standalone       | todo   |       |
| championcross           | comiciviewer     | todo   |       |
| ciaoplus                | standalone       | todo   |       |
| cmoa                    | standalone       | todo   |       |
| comicboost              | standalone       | todo   |       |
| comicborder             | gigaviewer       | todo   |       |
| comicdays               | gigaviewer       | todo   |       |
| comicearthstar          | gigaviewer       | todo   |       |
| comicfesta              | clipstudioreader | todo   |       |
| comicfuz                | standalone       | todo   |       |
| comicgardo              | gigaviewer       | todo   |       |
| comicgrast              | standalone       | todo   |       |
| comicmeteor             | standalone       | todo   |       |
| comicnettai             | standalone       | todo   |       |
| comico                  | standalone       | todo   |       |
| comicpash               | comiciviewer     | todo   |       |
| comicride               | comiciviewer     | todo   |       |
| comicroombase           | comiciviewer     | todo   |       |
| comicryu                | comiciviewer     | todo   |       |
| comicyours              | gigaviewer       | todo   |       |
| comirela                | comiciviewer     | todo   |       |
| corocoroonline          | standalone       | todo   |       |
| coronaex                | standalone       | todo   |       |
| cycomi                  | standalone       | todo   |       |
| dmm                     | standalone       | todo   |       |
| docomo                  | standalone       | todo   |       |
| dokiraw                 | standalone       | todo   |       |
| drecomics               | standalone       | todo   |       |
| ebookjapan              | standalone       | todo   |       |
| firecross               | clipstudioreader | todo   |       |
| flowercomics            | standalone       | todo   |       |
| fodfuji                 | standalone       | todo   |       |
| ganganonline            | standalone       | todo   |       |
| ganma                   | standalone       | todo   |       |
| gaugaumonsterplus       | standalone       | todo   |       |
| gcomi                   | comiciviewer     | todo   |       |
| gorakuweb               | standalone       | todo   |       |
| hachiraw                | standalone       | todo   |       |
| hanayume                | comiciviewer     | todo   |       |
| hayacomic               | comiciviewer     | todo   |       |
| herosweb                | comiciviewer     | todo   |       |
| ichicomi                | gigaviewer       | todo   |       |
| idolgravureprincessdate | standalone       | todo   |       |
| jmanga                  | mangareader      | todo   |       |
| jnbooks                 | comiciviewer     | todo   |       |
| jumprookie              | standalone       | todo   |       |
| jumptoon                | standalone       | todo   |       |
| kadocomi                | standalone       | todo   |       |
| kimicomi                | comiciviewer     | todo   |       |
| kisslove                | standalone       | todo   |       |
| klraw                   | mangareader      | todo   |       |
| klto9                   | standalone       | todo   |       |
| kmansin09               | madara           | todo   |       |
| kumaraw                 | standalone       | todo   |       |
| kuragebunch             | gigaviewer       | todo   |       |
| linemanga               | standalone       | todo   |       |
| magazinepocket          | standalone       | todo   |       |
| magcomi                 | gigaviewer       | todo   |       |
| magkan                  | comiciviewer     | todo   |       |
| manga1000               | standalone       | todo   |       |
| mangabang               | comiciviewer     | todo   |       |
| mangabu                 | comiciviewer     | todo   |       |
| mangafive               | standalone       | todo   |       |
| mangagun                | fmreader         | todo   |       |
| mangakingdom            | standalone       | todo   |       |
| mangakuro               | standalone       | todo   |       |
| mangalt                 | comiciviewer     | todo   |       |
| mangamee                | standalone       | todo   |       |
| mangameets              | standalone       | todo   |       |
| mangamura               | mangareader      | todo   |       |
| mangano                 | standalone       | todo   |       |
| mangaone                | standalone       | todo   |       |
| mangaparkpublisher      | standalone       | todo   |       |
| mangasaison             | standalone       | todo   |       |
| mangaspa                | comiciviewer     | todo   |       |
| mangatoshokanz          | standalone       | todo   |       |
| mangaupjapan            | standalone       | todo   |       |
| mangazegra              | comiciviewer     | todo   |       |
| mechacomic              | standalone       | todo   |       |
| mokuro                  | standalone       | todo   |       |
| momonga                 | standalone       | todo   |       |
| musicbookjp             | standalone       | todo   |       |
| namicomic               | comiciviewer     | todo   |       |
| nicomanga               | standalone       | todo   |       |
| nicovideoseiga          | standalone       | todo   |       |
| nikkangecchan           | standalone       | todo   |       |
| ohtawebcomic            | standalone       | todo   |       |
| pashup                  | standalone       | todo   |       |
| piacomic                | comiciviewer     | todo   |       |
| piccoma                 | standalone       | todo   |       |
| pixivcomic              | standalone       | todo   |       |
| raw1001                 | liliana          | todo   |       |
| raw18                   | wpcomics         | todo   |       |
| rawbaka                 | madara           | todo   |       |
| rawdevartart            | standalone       | todo   |       |
| rawinu                  | fmreader         | todo   |       |
| rawkuma                 | natsuid          | todo   |       |
| rawlh                   | fmreader         | todo   |       |
| rawotaku                | mangareader      | todo   |       |
| rawuwu                  | standalone       | todo   |       |
| rawxz                   | standalone       | todo   |       |
| readerstore             | standalone       | todo   |       |
| rimacomiplus            | comiciviewer     | todo   |       |
| senmanga                | standalone       | todo   |       |
| shonenjumpplus          | gigaviewer       | todo   |       |
| sokuyomi                | standalone       | todo   |       |
| sundaywebevery          | gigaviewer       | todo   |       |
| takecomic               | comiciviewer     | todo   |       |
| tonarinoyoungjump       | gigaviewer       | todo   |       |
| twi4                    | standalone       | todo   |       |
| unext                   | standalone       | todo   |       |
| welovemangaone          | fmreader         | todo   |       |
| yanmaga                 | standalone       | todo   |       |
| ynjn                    | standalone       | todo   |       |
| yomonga                 | standalone       | todo   |       |
| younganimal             | comiciviewer     | todo   |       |
| youngchampion           | comiciviewer     | todo   |       |
| zebrack                 | standalone       | todo   |       |
| zenon                   | gigaviewer       | todo   |       |
| zerosumonline           | standalone       | todo   |       |

## all

| Extension             | Theme         | Status | Notes    |
| --------------------- | ------------- | ------ | -------- |
| ahottie               | standalone    | todo   |          |
| akuma                 | standalone    | todo   |          |
| allporncomicsco       | madara        | todo   |          |
| asmhentai             | galleryadults | todo   |          |
| baobua                | standalone    | todo   |          |
| beauty3600000         | standalone    | todo   |          |
| buondua               | standalone    | todo   |          |
| comicfury             | standalone    | todo   |          |
| comicgrowl            | comiciviewer  | todo   |          |
| comicklive            | standalone    | todo   |          |
| comicskingdom         | standalone    | todo   |          |
| comicsvalley          | madara        | todo   |          |
| comikey               | standalone    | todo   |          |
| commitstrip           | standalone    | todo   |          |
| coomer                | kemono        | todo   |          |
| cosplaytele           | standalone    | todo   |          |
| cubari                | standalone    | todo   |          |
| danbooru              | standalone    | todo   |          |
| deviantart            | standalone    | todo   |          |
| doujiva               | standalone    | todo   |          |
| dragonballmultiverse  | standalone    | todo   |          |
| e621                  | standalone    | todo   |          |
| elitebabes            | masonry       | todo   |          |
| everiaclub            | standalone    | todo   |          |
| everiaclubcom         | standalone    | todo   |          |
| femjoyhunter          | masonry       | todo   |          |
| foamgirl              | standalone    | todo   |          |
| foolslidecustomizable | foolslide     | todo   |          |
| fourkhd               | standalone    | todo   |          |
| ftvhunter             | masonry       | todo   |          |
| globalcomix           | standalone    | todo   |          |
| grabberzone           | madara        | todo   |          |
| hdoujin               | standalone    | todo   |          |
| hennojin              | standalone    | todo   |          |
| hentai3               | standalone    | todo   |          |
| hentaicosplay         | standalone    | todo   |          |
| hentaienvy            | galleryadults | todo   |          |
| hentaiera             | galleryadults | todo   |          |
| hentaifox             | galleryadults | todo   |          |
| hentaihand            | hentaihand    | todo   |          |
| hentailoop            | standalone    | todo   |          |
| hentairox             | galleryadults | todo   |          |
| hentaizap             | galleryadults | todo   |          |
| hniscantrad           | pizzareader   | todo   |          |
| holonometria          | standalone    | todo   |          |
| honeytoon             | standalone    | todo   |          |
| imhentai              | galleryadults | todo   |          |
| izneo                 | standalone    | todo   |          |
| jjcos                 | standalone    | todo   |          |
| joymiihub             | masonry       | todo   |          |
| junmeitu              | standalone    | todo   |          |
| kagane                | standalone    | todo   |          |
| kemono                | kemono        | todo   |          |
| kiutaku               | standalone    | todo   |          |
| kodokustudio          | madara        | todo   |          |
| koharu                | standalone    | todo   |          |
| komga                 | standalone    | todo   |          |
| lanraragi             | standalone    | todo   |          |
| leagueoflegends       | standalone    | todo   |          |
| lunaranime            | standalone    | todo   |          |
| luscious              | standalone    | todo   |          |
| magicaltranslators    | guya          | todo   |          |
| manga18fx             | standalone    | todo   |          |
| manga18me             | standalone    | todo   |          |
| mangaball             | standalone    | todo   |          |
| mangacrazy            | madara        | todo   |          |
| mangadex              | standalone    | done   | existing |
| mangadna              | standalone    | todo   |          |
| mangadotnet           | standalone    | todo   |          |
| mangadraft            | standalone    | todo   |          |
| mangafire             | standalone    | todo   |          |
| mangaforfree          | madara        | todo   |          |
| mangamillion          | standalone    | todo   |          |
| mangaplus             | standalone    | todo   |          |
| mangapluscreators     | standalone    | todo   |          |
| mangatoon             | standalone    | todo   |          |
| mangaup               | standalone    | todo   |          |
| mango                 | standalone    | todo   |          |
| manhuarm              | standalone    | todo   |          |
| manhwa18cc            | madara        | todo   |          |
| manhwa18net           | standalone    | todo   |          |
| manhwaclubnet         | madara        | todo   |          |
| manhwadashraw         | madara        | todo   |          |
| manta                 | standalone    | todo   |          |
| mayotune              | standalone    | todo   |          |
| metarthunter          | masonry       | todo   |          |
| miauscan              | mangathemesia | todo   |          |
| misskon               | standalone    | todo   |          |
| mitaku                | standalone    | todo   |          |
| myreadingmanga        | standalone    | todo   |          |
| namicomi              | standalone    | todo   |          |
| nhentaicom            | hentaihand    | todo   |          |
| nhentaito             | galleryadults | todo   |          |
| nhentaixxx            | galleryadults | todo   |          |
| niadd                 | standalone    | todo   |          |
| novelcool             | standalone    | todo   |          |
| onepiecefans          | standalone    | todo   |          |
| onisaga               | standalone    | todo   |          |
| ososedki              | standalone    | todo   |          |
| pandachaika           | standalone    | todo   |          |
| pawchive              | standalone    | todo   |          |
| peppercarrot          | standalone    | todo   |          |
| photos18              | standalone    | todo   |          |
| pixiv                 | standalone    | todo   |          |
| playmatehunter        | masonry       | todo   |          |
| pornpics              | standalone    | todo   |          |
| projectsuki           | standalone    | todo   |          |
| rokuhentai            | standalone    | todo   |          |
| sandraandwoo          | standalone    | todo   |          |
| saymanhwa             | standalone    | todo   |          |
| seraphicdeviltry      | madara        | todo   |          |
| simplycosplay         | standalone    | todo   |          |
| simplyhentai          | standalone    | todo   |          |
| stashapp              | standalone    | todo   |          |
| taddyink              | standalone    | todo   |          |
| tappytoon             | standalone    | todo   |          |
| thelibraryofohara     | standalone    | todo   |          |
| toomics               | standalone    | todo   |          |
| twicomi               | standalone    | todo   |          |
| v2ph                  | standalone    | todo   |          |
| vinnieVeritas         | standalone    | todo   |          |
| webcomics             | standalone    | todo   |          |
| webtoons              | standalone    | todo   |          |
| xarthunter            | masonry       | todo   |          |
| xasiatalbums          | standalone    | todo   |          |
| xcomic                | standalone    | todo   |          |
| xgmn                  | standalone    | todo   |          |
| xiutaku               | standalone    | todo   |          |
| xkcd                  | standalone    | todo   |          |
| yabai                 | standalone    | todo   |          |
| yaoimangaonline       | standalone    | todo   |          |
| yellownote            | standalone    | todo   |          |
| yskcomics             | standalone    | todo   |          |

## Pending

`pending/<lang>/<id>/` holds extensions that are ported but cannot be tested from here (e.g. Cloudflare challenges
Node's fetch while curl passes). They are not built, tested or published. Move one back to `src/<lang>/` and run
`scripts/record.sh` when it can be tested.
