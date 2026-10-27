import { Rating, type Grade } from "./srs";
import type { QuestionKind } from "../types";

export interface Attempt {
  correct: boolean;
  /** The child asked for a hint (replay with letters shown, first letter, …). */
  hinted: boolean;
  /** Wrong taps before getting it right; only letter tiles allow more than one try. */
  mistakes: number;
  ms: number;
}

/** Time an adult needs before an answer counts as "slow". Scaled by the child's age factor. */
export function slowMs(kind: QuestionKind, letters = 0): number {
  switch (kind) {
    case "pickImage":
      return 5000;
    case "pickMeaning":
    case "listenPick":
      return 6000;
    case "tiles":
      return 3000 + letters * 1500;
  }
}

/** Age factor: younger children read and tap more slowly, so "slow" starts later. */
export function ageFactor(age: number): number {
  if (age <= 7) return 2;
  if (age <= 9) return 1.6;
  if (age <= 11) return 1.3;
  return 1.1;
}

/**
 * Turn an answer into an FSRS grade, so children never have to rate themselves:
 *   wrong, or two+ wrong letter taps   → Again
 *   right but slow, hinted, or one slip → Hard
 *   right                              → Good
 *   spelled quickly with no slips      → Easy
 */
export function gradeAttempt(a: Attempt, kind: QuestionKind, factor: number, letters = 0): Grade {
  if (!a.correct || a.mistakes >= 2) return Rating.Again;
  const slow = slowMs(kind, letters) * factor;
  if (a.hinted || a.mistakes === 1 || a.ms > slow) return Rating.Hard;
  if (kind === "tiles" && a.ms < slow * 0.5) return Rating.Easy;
  return Rating.Good;
}
