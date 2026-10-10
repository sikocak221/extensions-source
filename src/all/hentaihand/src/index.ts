import { defineExtension } from '@matane/extension-sdk';
import { HentaiHand, LOGIN_PREFERENCES } from './hentaihand/HentaiHand';

/** Site language ids of each source language. */
const LANGUAGE_IDS: Record<string, number[]> = {
  all: [],
  ja: [3, 29],
  en: [2, 27],
  zh: [1, 50],
  bg: [4],
  ceb: [5, 44],
  other: [6],
  tl: [7, 55],
  ar: [8, 49],
  el: [9],
  sr: [10],
  jv: [11, 51],
  uk: [12, 46],
  tr: [13, 41],
  fi: [14, 54],
  la: [15],
  mn: [16],
  eo: [17, 47],
  sk: [18],
  cs: [19, 52],
  ko: [30, 39],
  ru: [31],
  it: [32],
  es: [33, 37],
  pt: [34],
  th: [35, 40],
  fr: [36],
  id: [38],
  vi: [42],
  de: [43],
  pl: [45],
  hu: [48],
  nl: [53],
  hi: [56],
};

class HentaiHandExt extends HentaiHand {
  readonly name = 'HentaiHand';
  readonly baseUrl = 'https://hentaihand.com';
  readonly chapters = false;

  constructor(lang: string) {
    super();
    this.hhLangId = LANGUAGE_IDS[lang] ?? [];
  }
}

export default defineExtension({
  preferences: () => LOGIN_PREFERENCES,
  createSource: ({ lang }) => new HentaiHandExt(lang).toSource(),
});
