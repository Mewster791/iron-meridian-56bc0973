import { describe, expect, it } from 'vitest';
import { initialTesterCodeState, isTesterPassword, stepTesterCode, TesterCodeState } from './testerAccess';

function type(keys: string[], start = 1000, gap = 100) {
  let s: TesterCodeState = initialTesterCodeState;
  let unlocked = false;
  keys.forEach((k, i) => {
    const r = stepTesterCode(s, k, start + i * gap);
    s = r.state;
    unlocked = unlocked || r.unlocked;
  });
  return unlocked;
}

describe('tester panel unlock', () => {
  it('unlocks after Control then 94206722', () => {
    expect(type(['Control', ...'94206722'.split('')])).toBe(true);
  });

  it('needs Control first', () => {
    expect(type('94206722'.split(''))).toBe(false);
  });

  it('rejects a wrong digit', () => {
    expect(type(['Control', ...'94206723'.split('')])).toBe(false);
  });

  it('expires 10 seconds after Control', () => {
    expect(type(['Control', ...'94206722'.split('')], 0, 1500)).toBe(false);
  });

  it('accepts "blue" as the color password', () => {
    expect(isTesterPassword('blue')).toBe(true);
    expect(isTesterPassword(' Blue ')).toBe(true);
    expect(isTesterPassword('red')).toBe(false);
  });
});
