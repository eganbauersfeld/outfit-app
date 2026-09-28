import type { ClothingItem } from '../types';
import { PieceImage } from './Common';

/** A fit's pieces: photos in a mosaic when there are any, otherwise their colors as bands. Fills its (position: relative) parent. */
export function Artwork({ items }: { items: ClothingItem[] }) {
  const withPhotos = items.filter((i) => i.photoId).slice(0, 4);
  if (withPhotos.length) {
    const cols = withPhotos.length === 1 ? 1 : 2;
    return (
      <span style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr', gap: 1, background: '#111' }}>
        {withPhotos.map((i, n) => (
          <PhotoCell key={i.id} item={i} span={withPhotos.length === 3 && n === 0} bottom={touchesBottom(withPhotos.length, n)} />
        ))}
      </span>
    );
  }
  return (
    <span style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      {items.map((i) => (
        <span key={i.id} style={{ flex: 1, background: i.color.hex }} />
      ))}
    </span>
  );
}

/** Cells along the bottom sit under the date strip, so cutouts there leave it room. */
function touchesBottom(count: number, n: number) {
  if (count <= 2) return true;
  if (count === 3) return n === 0 || n === 2;
  return n >= 2;
}

function PhotoCell({ item, span, bottom }: { item: ClothingItem; span: boolean; bottom: boolean }) {
  return (
    <span style={{ gridRow: span ? 'span 2' : undefined, background: '#1b1b1b', overflow: 'hidden', position: 'relative' }}>
      <PieceImage item={item} label={bottom} />
    </span>
  );
}
