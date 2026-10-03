import { type FilterOption, type FilterState, type MangaPage, defineExtension } from '@matane/extension-sdk';
import { type Album, AUTHOR, SEARCH_RESULTS_OR_BASE, VARIOUS_AUTHORS, EroMuse } from './eromuse/EroMuse';
import { withQuery } from './eromuse/utils';

const ALBUMS: Album[] = [
  ['All Authors', '', SEARCH_RESULTS_OR_BASE],
  ['Various Authors', '/comics/various-authors', VARIOUS_AUTHORS],
  ['Hentai and Manga English', '/comics/hentai-and-manga-english', VARIOUS_AUTHORS],
  ['TabooLicious.xxx Comics', '/comics/taboolicious_xxx-comics', AUTHOR],
  ['IllustratedInterracial.com Comics', '/comics/illustratedinterracial_com-comics', AUTHOR],
  ['ZZZ Comics', '/comics/zzz-comics', AUTHOR],
  ['JohnPersons.com Comics', '/comics/johnpersons_com-comics', AUTHOR],
  ['For members only', '/', AUTHOR],
  ['PalComix Comics', '/comics/palcomix-comics', AUTHOR],
  ['Melkormancin.com Comics', '/comics/melkormancin_com-comics', AUTHOR],
  ['TG Comics', '/comics/tg-comics', AUTHOR],
  ['ShadBase Comics', '/comics/shadbase-comics', AUTHOR],
  ['Filthy Figments Comics', '/comics/filthy-figments-comics', AUTHOR],
  ['Witchking00 Comics', '/comics/witchking00-comics', AUTHOR],
  ['Tease Comix', '/comics/tease-comix', AUTHOR],
  ['PrismGirls Comics', '/comics/prismgirls-comics', AUTHOR],
  ['Croc Comics', '/comics/croc-comics', AUTHOR],
  ['CRAZYXXX3DWORLD Comics', '/comics/crazyxxx3dworld-comics', AUTHOR],
  ['Moiarte Comics', '/comics/moiarte-comics', AUTHOR],
  ['Nicole Heat Comics', '/comics/nicole-heat-comics', AUTHOR],
  ['Expansion Comics', '/comics/expansion-comics', AUTHOR],
  ['DizzyDills Comics', '/comics/dizzydills-comics', AUTHOR],
  ['Hustler Cartoons', '/comics/hustler-cartoons', AUTHOR],
  ['ArtOfJaguar Comics', '/comics/artofjaguar-comics', AUTHOR],
  ['Grow Comics', '/comics/grow-comics', AUTHOR],
  ['Bimbo Story Club Comics', '/comics/bimbo-story-club-comics', AUTHOR],
  ['HentaiTNA.com Comics', '/comics/hentaitna_com-comics', AUTHOR],
  ['ZZomp Comics', '/comics/zzomp-comics', AUTHOR],
  ['Seiren.com.br Comics', '/comics/seiren_com_br-comics', AUTHOR],
  ['DukesHardcoreHoneys.com Comics', '/comics/dukeshardcorehoneys_com-comics', AUTHOR],
  ['Frozen Parody Comics', '/comics/frozen-parody-comics', AUTHOR],
  ['Giantess Club Comics', '/comics/giantess-club-comics', AUTHOR],
  ['Ultimate3DPorn Comics', '/comics/ultimate3dporn-comics', AUTHOR],
  ['Sean Harrington Comics', '/comics/sean-harrington-comics', AUTHOR],
  ['Central Comics', '/comics/central-comics', AUTHOR],
  ['Mana World Comics', '/comics/mana-world-comics', AUTHOR],
  ['The Foxxx Comics', '/comics/the-foxxx-comics', AUTHOR],
  ['Bloody Sugar Comics', '/comics/bloody-sugar-comics', AUTHOR],
  ['Deuce Comics', '/comics/deuce-comics', AUTHOR],
  ['Adult Empire Comics', '/comics/adult-empire-comics', AUTHOR],
  ['SuperHeroineComixxx', '/comics/superheroinecomixxx', AUTHOR],
  ['Sluttish Comics', '/comics/sluttish-comics', AUTHOR],
  ['Damn3D Comics', '/comics/damn3d-comics', AUTHOR],
  ['Fake Celebrities Sex Pictures', '/comics/fake-celebrities-sex-pictures', AUTHOR],
  ['Secret Chest Comics', '/comics/secret-chest-comics', AUTHOR],
  ['Project Bellerophon Comics', '/comics/project-bellerophon-comics', AUTHOR],
  ['Smudge Comics', '/comics/smudge-comics', AUTHOR],
  ['Superheroine Central Comics', '/comics/superheroine-central-comics', AUTHOR],
  ['Jay Marvel Comics', '/comics/jay-marvel-comics', AUTHOR],
  ['Fred Perry Comics', '/comics/fred-perry-comics', AUTHOR],
  ['Seduced Amanda Comics', '/comics/seduced-amanda-comics', AUTHOR],
  ['VGBabes Comics', '/comics/vgbabes-comics', AUTHOR],
  ['SodomSluts.com Comics', '/comics/sodomsluts_com-comics', AUTHOR],
  ['AKABUR Comics', '/comics/akabur-comics', AUTHOR],
  ['eBluberry Comics', '/comics/ebluberry-comics', AUTHOR],
  ['InterracialComicPorn.com Comics', '/comics/interracialcomicporn_com-comics', AUTHOR],
  ['Dubh3d-Dubhgilla Comics', '/comics/dubh3d-dubhgilla-comics', AUTHOR],
  ['Gush Bomb Comix', '/comics/gush-bomb-comix', AUTHOR],
  ['Chiyoji Tomo Comics', '/comics/chiyoji-tomo-comics', AUTHOR],
  ['Mangrowing Comics', '/comics/mangrowing-comics', AUTHOR],
  ['eAdultComics Collection', '/comics/eadultcomics-collection', AUTHOR],
  ['Skulltitti Comics', '/comics/skulltitti-comics', AUTHOR],
  ['James Lemay Comics', '/comics/james-lemay-comics', AUTHOR],
  ['TalesOfPleasure.com Comics', '/comics/talesofpleasure_com-comics', AUTHOR],
  ['Eden Comics', '/comics/eden-comics', AUTHOR],
  ['WorldOfPeach Comics', '/comics/worldofpeach-comics', AUTHOR],
  ['Daniel40 Comics', '/comics/daniel40-comics', AUTHOR],
  ['DontFapGirl Comics', '/comics/dontfapgirl-comics', AUTHOR],
  ['Wingbird Comics', '/comics/wingbird-comics', AUTHOR],
  ['Intrigue3d.com Comics', '/comics/intrigue3d_com-comics', AUTHOR],
  ['Hentaikey Comics', '/comics/hentaikey-comics', AUTHOR],
  ['Kamina1978 Comics', '/comics/kamina1978-comics', AUTHOR],
  ['3DPerils Comics', '/comics/3dperils-comics', AUTHOR],
  ['Tracy Scops Comics', '/comics/tracy-scops-comics', AUTHOR],
  ['Shemale3D Comics', '/comics/shemale3d-comics', AUTHOR],
  ['InterracialSex3D.com Comics', '/comics/Interracialsex3d-Com-Comix', AUTHOR],
  ['MyHentaiGrid Comics', '/comics/myhentaigrid-comics', AUTHOR],
  ['Magnifire Comics', '/comics/magnifire-comics', AUTHOR],
  ['Reptileye Comics', '/comics/reptileye-comics', AUTHOR],
  ['ProjectPinkXXX.com Comics', '/comics/projectpinkxxx_com-comics', AUTHOR],
  ['CallMePlisskin Comics', '/comics/callmeplisskin-comics', AUTHOR],
];

class Erofus extends EroMuse {
  readonly name = 'Erofus';
  readonly baseUrl = 'https://www.erofus.com';

  override albumSelector = 'a.a-click';
  override topLevelPathSegment = 'comics';
  override linkedChapterSelector = 'a.a-click:has(img)[href^="/comics/"]';
  override pageThumbnailSelector = 'a.a-click:has(img)[href*="/pic/"] img';
  override pageThumbnailPathSegment = '/thumb/';
  override pageFullSizePathSegment = '/medium/';
  override authorBreadcrumb = {
    author: 'div.navigation-breadcrumb li:nth-child(3)',
    various: 'div.navigation-breadcrumb li:nth-child(5)',
  };
  override genreSelector = 'div.album-tag-container a';

  override getPopular(page: number): Promise<MangaPage> {
    return this.fetchManga(`${this.baseUrl}/comics/various-authors?sort=viewed&page=1`, page, 'viewed');
  }

  override getLatest(page: number): Promise<MangaPage> {
    return this.fetchManga(`${this.baseUrl}/comics/various-authors?sort=recent&page=1`, page, 'recent');
  }

  override searchStart(query: string, filters: FilterState): { url: string; pageType: number } {
    if (query)
      return {
        url: withQuery(`${this.baseUrl}/`, { search: query, sort: this.currentSortingMode, page: '1' }),
        pageType: SEARCH_RESULTS_OR_BASE,
      };
    const [, path, type] = this.selectedAlbum(filters);
    return { url: withQuery(`${this.baseUrl}${path}`, { sort: this.currentSortingMode, page: '1' }), pageType: type };
  }

  albums(): Album[] {
    return ALBUMS;
  }

  sorts(): FilterOption[] {
    return [
      { label: 'Viewed', value: 'viewed' },
      { label: 'Liked', value: 'liked' },
      { label: 'Date', value: 'recent' },
      { label: 'A-Z', value: 'az' },
    ];
  }
}

export default defineExtension({
  createSource: () => new Erofus().toSource(),
});
