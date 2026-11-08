// The public-name filter (#1652, decision #1616): the game is Edgefall, never "Edge", and the "edging" puns are refused. The words are
// data (FILTER_LIST); a name is refused when one of its words, or all its letters run together, starts with a listed word.
/** The puns refused in public names: lowercase, English then French spellings. "edge" and "edgefall" stay allowed. */
export const FILTER_LIST: readonly string[] = [
  'edging', 'edgeing', 'edgin', "edgin'", 'edjing', 'edjin', 'edgying', '3dging', 'edg1ng', 'edgeplay', 'edge play', 'edge-play',
  'edgeur', 'edgeuse', 'edgeurs', 'edgeuses', 'edgeuz', 'edjeur', 'edjeuse', 'edgeinge',
];

const LEET = '013457@$ı'; // read as LETTERS, character for character
const LETTERS = 'oieastasi';

/** The words of `text`: camel case split, lowercase, accents dropped, leetspeak read as letters, cut on anything else. */
const words = (text: string): string[] =>
  text
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[013457@$ı]/g, (c) => LETTERS.charAt(LEET.indexOf(c)))
    .split(/[^a-z]+/)
    .filter(Boolean);

/** The listed words, read the same way as a name, letters only. */
export const FILTER_WORDS: readonly string[] = FILTER_LIST.map((w) => words(w).join(''));

/** Whether a public name is refused: one of its words, or all its letters together ("e.d.g.i.n.g"), starts with a listed word. */
export const filtered = (name: string): boolean => {
  const parts = words(name);
  return [...parts, parts.join('')].some((w) => FILTER_WORDS.some((f) => w.startsWith(f)));
};
