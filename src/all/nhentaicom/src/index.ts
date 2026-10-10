import { defineExtension } from '@matane/extension-sdk';
import { HentaiHand, LOGIN_PREFERENCES } from './hentaihand/HentaiHand';

/** Site language ids of each source language. */
const LANGUAGE_IDS: Record<string, number[]> = {
  all: [],
  zh: [1],
  en: [2],
  ja: [3],
  other: [4],
  ar: [5],
  jv: [6],
  bg: [7],
  cs: [8],
  uk: [9],
  sk: [10],
  eo: [11],
  mn: [12],
  la: [13],
  ceb: [14],
  tl: [15],
  fi: [16],
  tr: [17],
  sr: [18],
  el: [19],
  ko: [20],
  ro: [21],
};

class NHentaiCom extends HentaiHand {
  readonly name = 'nHentai.com (unoriginal)';
  readonly baseUrl = 'https://nhentai.com';
  readonly chapters = false;

  constructor(lang: string) {
    super();
    this.hhLangId = LANGUAGE_IDS[lang] ?? [];
  }
}

export default defineExtension({
  preferences: () => LOGIN_PREFERENCES,
  createSource: ({ lang }) => new NHentaiCom(lang).toSource(),
});
