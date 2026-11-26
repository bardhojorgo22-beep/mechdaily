import { useEffect, useState } from 'react';
import type { Build } from '../../shared/game/mech';
import { PIXEL, mechSprite } from '../lib/sprite';

type Props = {
  build: Build;
  size?: number;
  flip?: boolean;
  bob?: boolean;
  className?: string;
};

/** The mech as a chunky pixel sprite. */
export const PixelMech = ({
  build,
  size = 120,
  flip = false,
  bob = false,
  className = '',
}: Props) => {
  const [url, setUrl] = useState<string | null>(null);
  const w = Math.max(16, Math.round(size / PIXEL));
  const h = Math.round((size * 220) / 200);

  useEffect(() => {
    let alive = true;
    mechSprite(build, w)
      .then((c) => {
        if (alive) setUrl(c.toDataURL());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [build, w]);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: h,
        flexShrink: 0,
        transform: flip ? 'scaleX(-1)' : undefined,
      }}
    >
      {url && (
        <img
          src={url}
          alt={`${build.name} mech`}
          width={size}
          height={h}
          className={bob ? 'mech-bob' : undefined}
          style={{ imageRendering: 'pixelated', display: 'block' }}
          draggable={false}
        />
      )}
    </div>
  );
};
