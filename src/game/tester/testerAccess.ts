/**
 * Hidden tester-panel unlock: tap Control, type the code digits, then answer the
 * "color" prompt. This is a convenience gate for playtesters, not security —
 * everything it unlocks is local campaign progress.
 */
export const TESTER_CODE = "94206722";
export const TESTER_PASSWORD = "blue";
/** Milliseconds allowed between Control and finishing the code. */
export const TESTER_CODE_WINDOW_MS = 10_000;

export interface TesterCodeState {
  armedAt: number | null;
  typed: string;
}

export const initialTesterCodeState: TesterCodeState = { armedAt: null, typed: "" };

/** Feed one key press (KeyboardEvent.key). Returns the next state and whether the code was just completed. */
export function stepTesterCode(
  state: TesterCodeState,
  key: string,
  now: number,
): { state: TesterCodeState; unlocked: boolean } {
  if (key === "Control") return { state: { armedAt: now, typed: "" }, unlocked: false };
  if (state.armedAt === null) return { state, unlocked: false };
  if (now - state.armedAt > TESTER_CODE_WINDOW_MS || !/^[0-9]$/.test(key)) {
    return { state: initialTesterCodeState, unlocked: false };
  }
  const typed = state.typed + key;
  if (!TESTER_CODE.startsWith(typed)) return { state: initialTesterCodeState, unlocked: false };
  if (typed === TESTER_CODE) return { state: initialTesterCodeState, unlocked: true };
  return { state: { armedAt: state.armedAt, typed }, unlocked: false };
}

export function isTesterPassword(answer: string): boolean {
  return answer.trim().toLowerCase() === TESTER_PASSWORD;
}
