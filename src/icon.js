// Generates the 128x128 project icon for OpenCode: dark green background, white text in two rows —
// the project prefix ("ac") in small letters on top, the first three letters of the container name in capitals below —
// and a light color band along the bottom, its hue picked from the name (looks random, stays the same per project).
// A hand-rolled PNG encoder (zlib + CRC) with a 5x7 bitmap font keeps this dependency-free.
import { deflateSync } from 'node:zlib';

const SIZE = 128, SS = 4, BG = [20, 83, 45], FG = [255, 255, 255]; // SS: supersampling for smooth edges

const BAND = 4; // bottom pixel rows in the accent color

// 5x7 pixel font ('#' = ink); lowercase and capital letters, digits and - cover all names and prefixes
const FONT = {
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#...', '####.', '.#...', '.#...', '.#...', '.#...'],
  g: ['.....', '.....', '.###.', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '..#..', '..#..', '..#..', '..#..', '..#..'],
  j: ['....#', '.....', '....#', '....#', '....#', '#...#', '.###.'],
  k: ['#....', '#....', '#...#', '#..#.', '###..', '#..#.', '#...#'],
  l: ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  m: ['.....', '.....', '##.##', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '#...#', '####.', '#....'],
  q: ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '###..', '.#...', '.#...', '.#...', '.##..'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.###.'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '.#.#.', '..#..', '..#..'],
  z: ['.....', '.....', '####.', '...#.', '..#..', '.#...', '####.'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
};

// Light accent color with a hue from the name, HSL(hue, 75%, 72%). Greens (hue 80-160) are skipped: no contrast with the background
const accent = name => {
  const h = (160 + [...name].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % 280) % 360, s = 0.75, l = 0.72;
  const f = k => { const a = s * Math.min(l, 1 - l), t = (k + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1)))); };
  return [f(0), f(8), f(4)];
};

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), head = Buffer.alloc(8), crc = Buffer.alloc(4);
  head.writeUInt32BE(data.length); t.copy(head, 4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([head, data, crc]); };

const png = rgba => {
  const ihdr = Buffer.alloc(13), stride = SIZE * 4, raw = Buffer.alloc((stride + 1) * SIZE);
  ihdr.writeUInt32BE(SIZE); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  for (let y = 0; y < SIZE; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

// Draws one text row centered horizontally; s and y are in final-image pixels (rendered at SS x)
const draw = (img, dim, text, s, y) => {
  let x = Math.round((SIZE - (text.length * 6 - 1) * s) / 2) * SS;
  for (const ch of text) {
    const g = FONT[ch];
    if (g) for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '#')
      for (let dy = 0; dy < s * SS; dy++) for (let dx = 0; dx < s * SS; dx++) {
        const i = ((y * SS + r * s * SS + dy) * dim + x + c * s * SS + dx) * 3;
        img[i] = FG[0]; img[i + 1] = FG[1]; img[i + 2] = FG[2];
      }
    x += 6 * s * SS;
  }
};

// The icon as a data URL for OpenCode's project icon override
export const projectIcon = (name, prefix = 'ac') => {
  const dim = SIZE * SS, img = Buffer.alloc(dim * dim * 3);
  const band = accent(name);
  for (let i = 0; i < dim * dim; i++) { const c = i >= dim * (SIZE - BAND) * SS ? band : BG; img[i * 3] = c[0]; img[i * 3 + 1] = c[1]; img[i * 3 + 2] = c[2]; }
  const rows = [[prefix.replace(/[^a-z0-9]/g, ''), 3], [name.slice(0, 3).toUpperCase(), 6]].filter(([t]) => t);
  const gap = 12, total = rows.reduce((n, [, s]) => n + 7 * s, 0) + gap * (rows.length - 1);
  let y = Math.round((SIZE - BAND - total) / 2) - 4; // centered above the band, then nudged up
  for (const [t, s] of rows) { draw(img, dim, t, s, y); y += 7 * s + gap; }
  const out = Buffer.alloc(SIZE * SIZE * 4); // downsample SS x SS blocks for smooth edges
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
      const i = ((py * SS + dy) * dim + px * SS + dx) * 3;
      r += img[i]; g += img[i + 1]; b += img[i + 2];
    }
    const o = (py * SIZE + px) * 4, n = SS * SS;
    out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
  }
  return `data:image/png;base64,${png(out).toString('base64')}`;
};
