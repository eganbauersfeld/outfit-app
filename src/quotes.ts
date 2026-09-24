import { useEffect, useState } from 'react';

// 50-quote pool. A new one each time the app is opened (or brought back to the front),
// never the same one twice in a row; it stays put while he moves between tabs.
export const QUOTES: { text: string; author: string }[] = [
  { text: 'Fashion fades, only style remains the same.', author: 'Coco Chanel' },
  { text: 'Elegance is the only beauty that never fades.', author: 'Audrey Hepburn' },
  { text: 'Fashion is architecture: it is a matter of proportions.', author: 'Coco Chanel' },
  { text: 'In order to be irreplaceable, one must always be different.', author: 'Coco Chanel' },
  { text: 'Simplicity is the keynote of all true elegance.', author: 'Coco Chanel' },
  { text: 'Luxury must be comfortable, otherwise it is not luxury.', author: 'Coco Chanel' },
  { text: 'Dress shabbily and they remember the dress; dress impeccably and they remember the woman.', author: 'Coco Chanel' },
  { text: 'The best color in the world is the one that looks good on you.', author: 'Coco Chanel' },
  { text: 'Fashion has to do with ideas, the way we live, what is happening.', author: 'Coco Chanel' },
  { text: 'Style is a way to say who you are without having to speak.', author: 'Rachel Zoe' },
  { text: 'Fashion you can buy, but style one must possess.', author: 'Edna Woolman Chase' },
  { text: 'Style is knowing who you are and not giving a damn.', author: 'Orson Welles' },
  { text: 'Give a girl the right shoes, and she can conquer the world.', author: 'Marilyn Monroe' },
  { text: 'Buy less, choose well.', author: 'Vivienne Westwood' },
  { text: 'The difference between style and fashion is quality.', author: 'Giorgio Armani' },
  { text: 'Fashions fade, style is eternal.', author: 'Yves Saint Laurent' },
  { text: 'What matters in a dress is the woman who is wearing it.', author: 'Yves Saint Laurent' },
  { text: 'Style is something each of us already has, we just need to find it.', author: 'Diane von Furstenberg' },
  { text: "Fashion isn't about labels, it's about something that comes from within you.", author: 'Ralph Lauren' },
  { text: "I don't design clothes, I design dreams.", author: 'Ralph Lauren' },
  { text: 'Create your own style and let it be unique to you.', author: 'Anna Wintour' },
  { text: 'Style is very personal, it has nothing to do with fashion.', author: 'Anna Wintour' },
  { text: 'The joy of dressing is an art.', author: 'John Galliano' },
  { text: "Fashion is dressing according to what's fashionable, style is being yourself.", author: 'Oscar de la Renta' },
  { text: 'Being well dressed is a question of balance and common sense.', author: 'Oscar de la Renta' },
  { text: 'One is never overdressed or underdressed with a little black dress.', author: 'Karl Lagerfeld' },
  { text: 'Trendy is the last stage before tacky.', author: 'Karl Lagerfeld' },
  { text: 'What you wear is how you present yourself to the world.', author: 'Miuccia Prada' },
  { text: 'Fashion is instant language.', author: 'Miuccia Prada' },
  { text: "Clothes aren't going to change the world, the women who wear them will.", author: 'Anne Klein' },
  { text: 'Real style is about being true to yourself.', author: 'Michael Kors' },
  { text: 'Nothing makes a woman more beautiful than the belief that she is beautiful.', author: 'Sophia Loren' },
  { text: 'You can have anything you want in life if you dress for it.', author: 'Edith Head' },
  { text: 'Fashion is the most powerful art there is — movement, design, color, all in one.', author: 'Anna Sui' },
  { text: 'Fashion should be a form of escapism, not a form of imprisonment.', author: 'Alexander McQueen' },
  { text: 'Clothes mean nothing until someone lives in them.', author: 'Marc Jacobs' },
  { text: "I don't do fashion, I am fashion.", author: 'Coco Chanel' },
  { text: "Whoever said money can't buy happiness didn't know where to shop.", author: 'Bo Derek' },
  { text: 'Fashion is what you buy, style is what you do with it.', author: 'Unknown' },
  { text: 'Style is a reflection of your attitude and personality.', author: 'Unknown' },
  { text: 'Wear what makes you feel most like yourself.', author: 'Unknown' },
  { text: 'A little sparkle never hurt anybody.', author: 'Unknown' },
  { text: 'Confidence is the best outfit, wear it well.', author: 'Unknown' },
  { text: 'Take care of your clothes and your clothes will take care of you.', author: 'Unknown' },
  { text: 'Fashion is bought, style you already have.', author: 'Unknown' },
  { text: 'Adorn yourself with love.', author: 'Unknown' },
  { text: 'Minimal effort, maximum style.', author: 'Unknown' },
  { text: 'Great style never fades.', author: 'Unknown' },
  { text: 'Dress like you already know where you are going.', author: 'Unknown' },
  { text: 'Fashion is temporary, personal style is forever.', author: 'Unknown' },
];

const LAST = 'outfit.lastQuote';

function pick(): number {
  let last = -1;
  try {
    last = Number(localStorage.getItem(LAST) ?? -1);
  } catch {
    /* private mode */
  }
  let i = Math.floor(Math.random() * QUOTES.length);
  if (i === last) i = (i + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length;
  try {
    localStorage.setItem(LAST, String(i));
  } catch {
    /* ignore */
  }
  return i;
}

let current = pick();
const listeners = new Set<() => void>();

// A home-screen app often resumes instead of reloading, so coming back to the front counts as opening it.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  current = pick();
  listeners.forEach((f) => f());
});

export function useQuote() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return QUOTES[current];
}
