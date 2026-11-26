import { PixelMech } from '../components/PixelMech';
import { TRAINER } from '../lib/intro';

export const Intro = ({ onWatch, onSkip }: { onWatch: () => void; onSkip: () => void }) => (
  <div className="sticker p-4 flex flex-col gap-3">
    <div className="font-display font-black text-3xl leading-none text-center">MECH DAILY</div>
    <div className="flex justify-center mech-bob">
      <PixelMech build={TRAINER} size={96} />
    </div>
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-2">
        <span className="tag bg-sun">1</span>
        <span>
          <b>Build a mech</b> from 10 parts. Every part changes how it moves and fights.
        </span>
      </div>
      <div className="flex gap-2">
        <span className="tag bg-teal">2</span>
        <span>
          <b>Fights are automatic.</b> Your pilot picks the range, dodges and charges on its own.
        </span>
      </div>
      <div className="flex gap-2">
        <span className="tag bg-rust text-white">3</span>
        <span>
          <b>Enter the daily bracket.</b> It runs at midnight UTC. Win it and the whole sub sees your mech.
        </span>
      </div>
    </div>
    <button className="btn bg-sun w-full text-lg" onClick={onWatch}>
      ▶ Watch a fight (20s)
    </button>
    <button className="text-xs underline text-mute" onClick={onSkip}>
      skip, I know how it works
    </button>
  </div>
);
