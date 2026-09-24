import { useEffect, useState } from 'react';

// 100-quote pool. A new one each time the app is opened (or brought back to the front),
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
  { text: 'Clothes make the man. Naked people have little or no influence on society.', author: 'Mark Twain' },
  { text: 'Know, first, who you are, and then adorn yourself accordingly.', author: 'Epictetus' },
  { text: 'Elegance is refusal.', author: 'Coco Chanel' },
  { text: 'Fashion is made to become unfashionable.', author: 'Coco Chanel' },
  { text: 'Elegance is not standing out, but being remembered.', author: 'Giorgio Armani' },
  { text: 'Style is a simple way of saying complicated things.', author: 'Jean Cocteau' },
  { text: 'Dressing well is a form of good manners.', author: 'Tom Ford' },
  { text: 'Fashion is the armor to survive the reality of everyday life.', author: 'Bill Cunningham' },
  { text: 'Fashion is what you’re offered four times a year by designers. And style is what you choose.', author: 'Lauren Hutton' },
  { text: 'Don’t be into trends. Don’t make fashion own you, but you decide what you are.', author: 'Gianni Versace' },
  { text: 'In difficult times, fashion is always outrageous.', author: 'Elsa Schiaparelli' },
  { text: 'Fashion is like eating, you shouldn’t stick to the same menu.', author: 'Kenzo Takada' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'Life is too short to wear boring clothes.', author: 'Unknown' },
  { text: 'Jeans represent democracy in fashion.', author: 'Giorgio Armani' },
  { text: 'I have often said that I wish I had invented blue jeans.', author: 'Yves Saint Laurent' },
  { text: 'Being perfectly well-dressed gives a feeling of tranquility that religion is powerless to bestow.', author: 'Ralph Waldo Emerson' },
  { text: 'The only real elegance is in the mind; if you’ve got that, the rest really comes from it.', author: 'Diana Vreeland' },
  { text: 'You gotta have style. It helps you get down the stairs.', author: 'Diana Vreeland' },
  { text: 'Elegance is innate. It has nothing to do with being well dressed.', author: 'Diana Vreeland' },
  { text: 'Style is primarily a matter of instinct.', author: 'Bill Blass' },
  { text: 'When in doubt, wear red.', author: 'Bill Blass' },
  { text: 'People will stare. Make it worth their while.', author: 'Harry Winston' },
  { text: 'You can never be overdressed or overeducated.', author: 'Oscar Wilde' },
  { text: 'One should either be a work of art, or wear a work of art.', author: 'Oscar Wilde' },
  { text: 'A well-tied tie is the first serious step in life.', author: 'Oscar Wilde' },
  { text: 'I don’t like standard beauty — there is no beauty without strangeness.', author: 'Karl Lagerfeld' },
  { text: 'The best things in life are free. The second best things are very expensive.', author: 'Coco Chanel' },
  { text: 'Fashion changes, but style endures.', author: 'Coco Chanel' },
  { text: 'Luxury is in each detail.', author: 'Hubert de Givenchy' },
  { text: 'I firmly believe that with the right footwear one can rule the world.', author: 'Bette Midler' },
  { text: 'Shoes transform your body language and attitude.', author: 'Christian Louboutin' },
  { text: 'The finest clothing made is a person’s own skin, but, of course, society demands something more than this.', author: 'Mark Twain' },
  { text: 'Real style is never right or wrong. It’s a matter of being yourself on purpose.', author: 'G. Bruce Boyer' },
  { text: 'A man should look as if he has bought his clothes with intelligence, put them on with care, and then forgotten all about them.', author: 'Hardy Amies' },
  { text: 'Clothes and manners do not make the man; but when he is made, they greatly improve his appearance.', author: 'Henry Ward Beecher' },
  { text: 'Every day is a fashion show and the world is your runway.', author: 'Unknown' },
  { text: 'Quality is remembered long after price is forgotten.', author: 'Aldo Gucci' },
  { text: 'The details are not the details. They make the design.', author: 'Charles Eames' },
  { text: 'Less is more.', author: 'Ludwig Mies van der Rohe' },
  { text: 'Good design is as little design as possible.', author: 'Dieter Rams' },
  { text: 'Look good, feel good, play good.', author: 'Deion Sanders' },
  { text: 'Style is the dress of thoughts.', author: 'Lord Chesterfield' },
  { text: 'Dress how you want to be addressed.', author: 'Unknown' },
  { text: 'When you don’t dress like everybody else, you don’t have to think like everybody else.', author: 'Iris Apfel' },
  { text: 'More is more and less is a bore.', author: 'Iris Apfel' },
  { text: 'Color can raise the dead.', author: 'Iris Apfel' },
  { text: 'Clothes don’t make the man, but clothes have got many a man a good job.', author: 'Herbert Harold Vreeland' },
  { text: 'It’s always the badly dressed people who are the most interesting.', author: 'Jean Paul Gaultier' },
  { text: 'Never wear anything that panics the cat.', author: 'P.J. O’Rourke' },
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
