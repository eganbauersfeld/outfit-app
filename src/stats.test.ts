import { describe, expect, it } from 'vitest';
import { closet, log, TODAY } from './engine/fixtures';
import { addDays } from './dates';
import { uniquenessScore } from './stats';

const items = closet();
const byId = new Map(items.map((i) => [i.id, i]));
const ago = (n: number) => addDays(TODAY, -n);

describe('uniqueness', () => {
  it('a never-before-seen outfit scores 100', () => {
    const logs = [log(ago(1), ['t-white', 'b-jeans', 's-white']), log(TODAY, ['t-flannel', 'b-chinos', 's-boots'])];
    expect(uniquenessScore(logs, byId, TODAY)).toEqual({ value: 100, scope: 'today' });
  });

  it('repeating an outfit scores 0; changing only the shoes still scores low', () => {
    const exact = [log(ago(3), ['t-white', 'b-jeans', 's-white']), log(TODAY, ['t-white', 'b-jeans', 's-white'])];
    expect(uniquenessScore(exact, byId, TODAY)!.value).toBe(0);
    const shoes = [log(ago(3), ['t-white', 'b-jeans', 's-white']), log(TODAY, ['t-white', 'b-jeans', 's-boots'])];
    expect(uniquenessScore(shoes, byId, TODAY)!.value).toBeLessThan(40);
  });

  it('a new top matters more than new sunglasses', () => {
    const base = log(ago(2), ['t-white', 'b-jeans', 's-white', 'g-aviators']);
    const newTop = uniquenessScore([base, log(TODAY, ['t-black', 'b-jeans', 's-white', 'g-aviators'])], byId, TODAY)!.value;
    const newShades = uniquenessScore([base, log(TODAY, ['t-white', 'b-jeans', 's-white'])], byId, TODAY)!.value;
    expect(newTop).toBeGreaterThan(newShades);
  });

  it('outfits older than 60 days don’t count against you', () => {
    const logs = [log(ago(90), ['t-white', 'b-jeans', 's-white']), log(TODAY, ['t-white', 'b-jeans', 's-white'])];
    expect(uniquenessScore(logs, byId, TODAY)!.value).toBe(100);
  });

  it('before logging today, shows the 7-day average', () => {
    const logs = [log(ago(2), ['t-white', 'b-jeans', 's-white']), log(ago(1), ['t-white', 'b-jeans', 's-white'])];
    expect(uniquenessScore(logs, byId, TODAY)).toEqual({ value: 50, scope: 'week' }); // 100 then 0
    expect(uniquenessScore([], byId, TODAY)).toBeNull();
  });
});
