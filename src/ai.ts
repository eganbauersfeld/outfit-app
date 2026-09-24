import Anthropic from '@anthropic-ai/sdk';
import { addDays, todayKey } from './dates';
import { comboKey, daysSince, eligible, type Combo, type Starter } from './ideas';
import { lastWorn } from './stats';
import { lengthOf, sleeveOf, type ClothingItem, type WearLogEntry } from './types';
import type { Weather } from './weather';

// Outfit combos from Claude, called straight from the phone with his own API key
// (stored in localStorage, never in the code or the backup file). Only the closet's
// text metadata is sent — names, tags, wear history — never photos.

const KEY_STORAGE = 'outfit.anthropicKey';
const MODEL = 'claude-opus-5';

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private mode */
  }
}

const SYSTEM = `You help one person, Egan, get dressed from his own closet. You start him off; you never dictate. He has his own style — your job is to surface good options he might not think of, especially pieces and color pairings he hasn't worn lately.

Rules:
- Use only item ids from the closet list. Never invent pieces.
- Each outfit has exactly one Top and one Bottom, plus Shoes if he owns any. Add Outerwear when the weather calls for a layer and Sunglasses when it's sunny. At most one item per category (Misc can be skipped).
- Dress for the whole day's weather, not just the current temperature: a cool morning that warms up suits long sleeves with shorts or a removable layer.
- Treat the "starter" as a hint, not a rule. At least two outfits should follow it; one may deliberately break it if that makes a better outfit.
- Favor pieces not worn recently and underused color combinations. Safe bets and favorites are welcome but shouldn't fill every outfit. Never repeat an exact combination from the recent list.
- Make the three outfits genuinely different from each other.
- title: 2–3 words, lowercase-friendly, no emoji (e.g. "cool morning denim").
- why: one specific sentence under 16 words that names a piece, color, or weather detail. No generic praise.`;

const SCHEMA = {
  type: 'object',
  properties: {
    outfits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          why: { type: 'string' },
          itemIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'why', 'itemIds'],
        additionalProperties: false,
      },
    },
  },
  required: ['outfits'],
  additionalProperties: false,
} as const;

export class AiError extends Error {}

export async function aiCombos(apiKey: string, items: ClothingItem[], logs: WearLogEntry[], w: Weather | null, s: Starter | null): Promise<Combo[]> {
  const today = todayKey();
  const last = lastWorn(logs);
  const pool = eligible(items);
  const byId = new Map(pool.map((i) => [i.id, i]));

  const closet = pool.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    color: i.color.name,
    style: i.styleType,
    ...(i.category === 'Top' ? { sleeve: sleeveOf(i) } : {}),
    ...(i.category === 'Bottom' ? { length: lengthOf(i) } : {}),
    ...(i.material ? { material: i.material } : {}),
    favorite: i.isFavorite,
    safeBet: i.isSafeBet,
    thrifted: i.isThrifted,
    daysSinceWorn: daysSince(i, last, today),
  }));
  const recent = logs
    .filter((l) => l.date >= addDays(today, -30))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((l) => ({ date: l.date, items: l.itemIds.map((id) => byId.get(id)?.name).filter(Boolean) }));

  const input = {
    today: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    weather: w && {
      now: `${w.temp}°F, feels ${w.feelsLike}°F, ${w.condition}`,
      high: w.high,
      low: w.low,
      hourly: w.hours.map((h) => `${h.time} ${h.temp}° ${h.icon}`).join(', '),
      rainLikely: w.wet,
    },
    starter: s?.line ?? null,
    closet,
    recentOutfits: recent,
  };

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Latency matters more than depth here: he's standing at the closet.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // If Claude declines, the API retries on a fallback model instead of returning nothing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Suggest three outfits for today.\n\n${JSON.stringify(input)}` }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('Your API key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('That API key can’t use this model.');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('Rate limited — try again in a minute.');
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('Couldn’t reach Claude. Are you offline?');
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude returned an error (${e.status}).`);
    throw e;
  }

  if (response.stop_reason === 'refusal') throw new AiError('Claude declined this one.');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: { outfits: { title: string; why: string; itemIds: string[] }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError('Claude’s answer came back malformed.');
  }

  // Trust but verify: keep only real, eligible ids, one per category, and require top + bottom.
  const combos: Combo[] = [];
  for (const o of parsed.outfits ?? []) {
    const seen = new Set<string>();
    const ids = o.itemIds.filter((id) => {
      const item = byId.get(id);
      if (!item || seen.has(item.category)) return false;
      seen.add(item.category);
      return true;
    });
    if (!seen.has('Top') || !seen.has('Bottom')) continue;
    combos.push({ key: comboKey(ids), itemIds: ids, title: o.title, why: o.why, source: 'ai' });
  }
  if (!combos.length) throw new AiError('Claude’s picks didn’t match your closet.');
  return combos.slice(0, 3);
}
