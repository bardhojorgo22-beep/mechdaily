import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Build } from '../../shared/game/mech';
import { MechArt } from '../components/MechArt';
import type { MechLayer } from '../components/mechLayers';

// Turns the vector mech into a crunchy low-res pixel sprite.
// Each art pixel is about PIXEL css pixels on screen.
export const PIXEL = 2;

const cache = new Map<string, Promise<HTMLCanvasElement>>();

const svgMarkup = (build: Build, only?: MechLayer): string => {
  const out = renderToStaticMarkup(createElement(MechArt, { build, size: 200, ...(only ? { only } : {}) }));
  return out.includes('xmlns=') ? out : out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
};

const INK: [number, number, number] = [27, 26, 23];
const isInk = (d: Uint8ClampedArray, i: number) => d[i]! === INK[0] && d[i + 1]! === INK[1] && d[i + 2]! === INK[2];

/**
 * Makes flat pixel art read as solid metal: a 1px ink outline around the silhouette,
 * light from the top-left (bright rims, shadowed undersides) and a soft top-to-bottom falloff.
 */
const shade = (d: Uint8ClampedArray, w: number, h: number) => {
  const src = new Uint8ClampedArray(d);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3]! > 0;
  const paint = (x: number, y: number) => {
    if (!solid(x, y)) return false;
    const i = (y * w + x) * 4;
    return !(src[i] === INK[0] && src[i + 1] === INK[1] && src[i + 2] === INK[2]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!solid(x, y)) {
        // outline: an empty pixel touching the silhouette becomes ink
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
          d[i] = INK[0];
          d[i + 1] = INK[1];
          d[i + 2] = INK[2];
          d[i + 3] = 255;
        }
        continue;
      }
      if (isInk(src, i)) continue;
      let f = 1.06 - (y / h) * 0.16; // soft falloff toward the feet
      const rimTop = !paint(x, y - 1) || !paint(x - 1, y);
      const rimBottom = !paint(x, y + 1) || !paint(x + 1, y);
      if (rimTop && !rimBottom) f += 0.22;
      else if (rimBottom && !rimTop) f -= 0.24;
      // a faint diagonal sheen across big flat plates
      if (!rimTop && !rimBottom && (x + y) % 9 === 0) f += 0.06;
      for (let c = 0; c < 3; c++)
        d[i + c] = Math.max(0, Math.min(255, Math.round(src[i + c]! * f + (f > 1 ? (f - 1) * 60 : 0))));
    }
  }
};

const rasterize = (markup: string, w: number): Promise<HTMLCanvasElement> =>
  new Promise((resolve, reject) => {
    const h = Math.round((w * 220) / 200);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) return reject(new Error('no 2d'));
      g.drawImage(img, 0, 0, w, h);
      // Kill anti-aliasing: every pixel is either solid or empty.
      const data = g.getImageData(0, 0, w, h);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3]! < 110) {
          d[i + 3] = 0;
        } else {
          // ink-ish edge pixels snap to ink, keeps outlines crisp
          const lum = d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11;
          if (d[i + 3]! < 230 && lum < 140) {
            d[i] = 27;
            d[i + 1] = 26;
            d[i + 2] = 23;
          }
          d[i + 3] = 255;
        }
      }
      shade(d, w, h);
      g.putImageData(data, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error('sprite failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });

/** Pixel sprite for a build, `w` art-pixels wide. Cached. */
export const mechSprite = (build: Build, w: number, only?: MechLayer): Promise<HTMLCanvasElement> => {
  const key = `${w}:${only ?? 'all'}:${JSON.stringify(build.parts)}:${JSON.stringify(build.paint)}`;
  let p = cache.get(key);
  if (!p) {
    p = rasterize(svgMarkup(build, only), w);
    cache.set(key, p);
    if (cache.size > 200) cache.delete(cache.keys().next().value ?? '');
  }
  return p;
};
