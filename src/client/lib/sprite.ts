import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Build } from '../../shared/game/mech';
import { MechArt } from '../components/MechArt';

// Turns the vector mech into a crunchy low-res pixel sprite.
// Each art pixel is about PIXEL css pixels on screen.
export const PIXEL = 2;

const cache = new Map<string, Promise<HTMLCanvasElement>>();

const svgMarkup = (build: Build): string => {
  const out = renderToStaticMarkup(
    createElement(MechArt, { build, size: 200 })
  );
  return out.includes('xmlns=')
    ? out
    : out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
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
      g.putImageData(data, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error('sprite failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });

/** Pixel sprite for a build, `w` art-pixels wide. Cached. */
export const mechSprite = (
  build: Build,
  w: number
): Promise<HTMLCanvasElement> => {
  const key = `${w}:${JSON.stringify(build.parts)}:${JSON.stringify(build.paint)}`;
  let p = cache.get(key);
  if (!p) {
    p = rasterize(svgMarkup(build), w);
    cache.set(key, p);
    if (cache.size > 80) cache.delete(cache.keys().next().value ?? '');
  }
  return p;
};
