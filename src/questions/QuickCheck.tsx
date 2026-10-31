import { useEffect, useState } from "react";
import { slowMs, type Attempt } from "../srs/grade";
import type { Accent, Word } from "../types";
import { Choice } from "./Choice";

/** A word counts as known when its meaning is picked right, unhinted, within this share of "slow". */
const KNOWN_SHARE = 0.6;

export const isKnown = (a: Attempt, factor: number) => a.correct && !a.hinted && a.ms <= slowMs("pickMeaning") * factor * KNOWN_SHARE;

/** From word `i` on, put second meanings straight on the teaching list (the word looks familiar, the meaning is new). */
function passSecondMeanings(words: Word[], i: number, unknown: string[], want: number): [number, string[]] {
  while (i < words.length && words[i].of && unknown.length < want) unknown = [...unknown, words[i++].id];
  return [i, unknown];
}

/**
 * Before teaching, ask each new word once: see it, pick its meaning. A quick right answer means the
 * child already knows it, so it is not taught (and the next word takes its place); the check stops
 * once `want` words to teach are found.
 */
export function QuickCheck(props: {
  words: Word[];
  want: number;
  poolOf: (w: Word) => Word[];
  accent: Accent;
  sound: boolean;
  factor: number;
  onKnown: (w: Word, a: Attempt) => void;
  onDone: (unknown: string[]) => void;
}) {
  const { words, want, poolOf, accent, sound, factor, onKnown, onDone } = props;
  const [state, setState] = useState(() => {
    const [i, unknown] = passSecondMeanings(words, 0, [], want);
    return { i, unknown, known: 0 };
  });
  const done = state.i >= words.length || state.unknown.length >= want;
  useEffect(() => {
    if (done) onDone(state.unknown);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the check ends

  if (done) return null;
  const w = words[state.i];

  const onAnswer = (a: Attempt) => {
    const knew = isKnown(a, factor);
    if (knew) onKnown(w, a);
    const [i, unknown] = passSecondMeanings(words, state.i + 1, knew ? state.unknown : [...state.unknown, w.id], want);
    setState({ i, unknown, known: state.known + (knew ? 1 : 0) });
  };

  return (
    <div className="quick-check">
      <div className="notice">
        ⚡ 快速检查：认识的词直接跳过，不认识的马上教你{state.known > 0 && `（已跳过 ${state.known} 个）`}
      </div>
      <Choice key={w.id} word={w} pool={poolOf(w)} kind="pickMeaning" accent={accent} sound={sound} check onAnswer={onAnswer} />
    </div>
  );
}
