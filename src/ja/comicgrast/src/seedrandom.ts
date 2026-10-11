// Port of davidbau/seedrandom (ARC4), as in keiyoushi.utils.SeedRandom.
const WIDTH = 256;
const CHUNKS = 6;
const DIGITS = 52;
const MASK = WIDTH - 1;

class ARC4 {
  private i = 0;
  private j = 0;
  private s: number[] = Array.from({ length: WIDTH }, (_, k) => k);

  constructor(key: number[]) {
    const effective = key.length ? key : [0];
    let jc = 0;
    for (let k = 0; k < WIDTH; k++) {
      const t = this.s[k]!;
      jc = MASK & (jc + effective[k % effective.length]! + t);
      this.s[k] = this.s[jc]!;
      this.s[jc] = t;
    }
    this.g(WIDTH);
  }

  g(count: number): number {
    let r = 0;
    for (let c = count; c > 0; c--) {
      this.i = MASK & (this.i + 1);
      const t = this.s[this.i]!;
      this.j = MASK & (this.j + t);
      const sj = this.s[this.j]!;
      this.s[this.i] = sj;
      this.s[this.j] = t;
      r = r * WIDTH + this.s[MASK & (sj + t)]!;
    }
    return r;
  }
}

export class SeedRandom {
  private startdenom = Math.pow(WIDTH, CHUNKS);
  private significance = Math.pow(2, DIGITS);
  private overflow = this.significance * 2;
  private arc4: ARC4;

  constructor(seed: string) {
    const key = new Array<number>(WIDTH).fill(0);
    let smear = 0;
    for (let j = 0; j < seed.length; j++) {
      smear ^= key[MASK & j]! * 19;
      key[MASK & j] = MASK & (smear + seed.charCodeAt(j));
    }
    this.arc4 = new ARC4(key.slice(0, Math.min(seed.length, WIDTH)));
  }

  nextDouble(): number {
    let n = this.arc4.g(CHUNKS);
    let d = this.startdenom;
    let x = 0;
    while (n < this.significance) {
      n = (n + x) * WIDTH;
      d *= WIDTH;
      x = this.arc4.g(1);
    }
    while (n >= this.overflow) {
      n /= 2;
      d /= 2;
      x = Math.floor(x / 2);
    }
    return (n + x) / d;
  }

  shuffle<T>(list: T[]): T[] {
    const keys = list.map((_, i) => i);
    const out: T[] = [];
    for (let k = list.length; k > 0; k--) {
      const r = Math.floor(this.nextDouble() * keys.length);
      out.push(list[keys.splice(r, 1)[0]!]!);
    }
    return out;
  }
}
