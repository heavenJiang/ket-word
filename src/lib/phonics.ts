/**
 * Phonics colouring: which letters of a word belong to a spelling pattern worth noticing. Four kinds,
 * by pattern rather than by exact sound, so a child sees the units they read: a vowel team (rain,
 * boat, night), an r-controlled vowel (car, bird, more), a consonant pair (ship, chick, sing) and a
 * silent letter (cake, knife, lamb). Everything else is plain. Rules cover regular words; words
 * whose letters break them are spelled out in EXCEPTIONS.
 */
export type Sound = "team" | "r" | "pair" | "silent";

const VOWEL = "aeiou";
const isVowel = (c: string | undefined) => !!c && VOWEL.includes(c);
const TEAMS3 = ["eigh", "ough", "augh", "igh"];
const TEAMS2 = ["ai", "ay", "ee", "ea", "ei", "ey", "ie", "oa", "oe", "oi", "oy", "oo", "ou", "ow", "au", "aw", "ew", "ue"];
const R3 = ["air", "ear", "eer", "our", "oor"];
const PAIRS3 = ["tch", "dge"];
const PAIRS2 = ["sh", "ch", "th", "ph", "wh", "ck", "ng", "qu"];
/** Endings after which a word's silent e stays silent: care-ful, scar-ed, bore-d. */
const ENDINGS = ["d", "s", "ful", "fully", "ly", "less", "ment"];

/**
 * Words the rules get wrong, in a small notation: (x) silent, [xx] vowel team, {xr} r-controlled,
 * <xx> consonant pair; other letters plain.
 */
const EXCEPTIONS: Record<string, string> = {
  listen: "lis(t)en",
  castle: "cas(t)l(e)",
  whistle: "<wh>is(t)l(e)",
  often: "of(t)en",
  christmas: "c(h){r}is(t)mas",
  island: "i(s)land",
  half: "ha(l)f",
  talk: "ta(l)k",
  walk: "wa(l)k",
  chalk: "<ch>a(l)k",
  calm: "ca(l)m",
  could: "c[ou](l)d",
  would: "w[ou](l)d",
  should: "<sh>[ou](l)d",
  hour: "(h){our}",
  honest: "(h)onest",
  wednesday: "we(d)n(e)sd[ay]",
  autumn: "[au]tum(n)",
  answer: "ans(w){er}",
  sword: "s(w){or}d",
  two: "t(w)o",
  guitar: "g(u)it{ar}",
  guess: "g(u)ess",
  guest: "g(u)est",
  guide: "g(u)id(e)",
  biscuit: "bisc(u)it",
  build: "b(u)ild",
  buy: "b(u)y",
  ghost: "g(h)ost",
  science: "s(c)ience",
  scientist: "s(c)ientist",
  variety: "variety",
  experience: "experienc(e)",
  ingredient: "ingredient",
  scissors: "s(c)iss{or}s",
  muscle: "mus(c)l(e)",
  foreign: "f{or}ei(g)n",
  sign: "si(g)n",
  design: "desi(g)n",
  sandwich: "san(d)wi<ch>",
  handsome: "han(d)som(e)",
  friend: "fr[ie]nd",
  create: "create",
  poem: "poem",
  quiet: "<qu>iet",
  diet: "diet",
  idea: "idea",
  area: "area",
  theatre: "<th>eatr(e)",
  being: "bei<ng>",
  people: "pe(o)pl(e)",
};

function parseException(s: string): (Sound | null)[] {
  const out: (Sound | null)[] = [];
  let mode: Sound | null = null;
  for (const c of s) {
    if (c === "(") mode = "silent";
    else if (c === "[") mode = "team";
    else if (c === "{") mode = "r";
    else if (c === "<") mode = "pair";
    else if (")]}>".includes(c)) mode = null;
    else out.push(mode);
  }
  return out;
}

/** One word, lower-case letters only: a class (or none) for every letter. */
function token(w: string): (Sound | null)[] {
  if (EXCEPTIONS[w]) return parseException(EXCEPTIONS[w]);
  const out: (Sound | null)[] = Array(w.length).fill(null);
  const mark = (i: number, n: number, s: Sound) => {
    for (let k = i; k < i + n; k++) out[k] = s;
  };
  const at = (i: number, xs: string[]) => xs.find((x) => w.startsWith(x, i));
  let i = 0;
  // silent first letters: knife, write, gnat
  if (/^(kn|wr|gn)/.test(w)) {
    mark(0, 1, "silent");
    i = 1;
  }
  while (i < w.length) {
    const rest = w.length - i;
    let m: string | undefined;
    if ((m = at(i, TEAMS3))) {
      mark(i, m.length, "team");
      i += m.length;
      continue;
    }
    if ((m = at(i, PAIRS3))) {
      mark(i, m.length, "pair");
      i += m.length;
      continue;
    }
    // a vowel, r and a silent e at the end of a word or before an ending: care, more, fire, careful, scared
    // (not inside a word, where the e is sounded: parent, different, forest)
    if (isVowel(w[i]) && w[i + 1] === "r" && w[i + 2] === "e" && (rest === 3 || ENDINGS.includes(w.slice(i + 3)))) {
      mark(i, 2, "r");
      out[i + 2] = "silent";
      i += 3;
      continue;
    }
    // r-controlled: the r closes the vowel (car, bird, teacher), not when a vowel or another r follows (very, carrot)
    if ((m = at(i, R3)) && !isVowel(w[i + 3]) && w[i + 3] !== "r" && w[i + 3] !== "y") {
      mark(i, 3, "r");
      i += 3;
      continue;
    }
    if (isVowel(w[i]) && w[i + 1] === "r" && !isVowel(w[i + 2]) && w[i + 2] !== "r" && w[i + 2] !== "y") {
      mark(i, 2, "r");
      i += 2;
      continue;
    }
    // a vowel team, but not a vowel before the i of -ing (going, doing), nor aw before a vowel (away)
    if ((m = at(i, TEAMS2)) && !(m[1] === "i" && w.endsWith("ing") && i + 1 === w.length - 3) && !(m === "aw" && isVowel(w[i + 2]))) {
      mark(i, 2, "team");
      i += 2;
      continue;
    }
    // ng before e says /ndʒ/ (orange, change): not the ng of sing
    if ((m = at(i, PAIRS2)) && !(m === "ng" && w[i + 2] === "e")) {
      mark(i, 2, "pair");
      i += 2;
      continue;
    }
    // b after m at the end: lamb, climb, thumb
    if (w[i] === "b" && w[i - 1] === "m" && i === w.length - 1) out[i] = "silent";
    // a final e after a consonant, with a vowel before it: cake, time, home, give, table
    if (w[i] === "e" && i === w.length - 1 && w.length >= 3 && !isVowel(w[i - 1]) && /[aeiouy]/.test(w.slice(0, i - 1))) out[i] = "silent";
    i++;
  }
  return out;
}

/**
 * Classes for each letter of `text` (a word or a phrase), in order, skipping spaces, hyphens and
 * other non-letters. Each word of a phrase is read on its own, so "go out" has no "oo".
 */
export function phonics(text: string): (Sound | null)[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .flatMap(token);
}

export const SOUND_ZH: Record<Sound, string> = {
  team: "元音组合",
  r: "带 r 的元音",
  pair: "辅音组合",
  silent: "不发音",
};
