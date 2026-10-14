import { Directory, File, Paths } from 'expo-file-system';
import { nanoid } from 'nanoid/non-secure';
import { enqueue } from '../../db/outbox';

/**
 * Proof photos, one per received item: all its packs together in one shot
 * (50 milk packets, one photo). The photo is linked to that item's receipts
 * (one per expiry date) and travels in the outbox right after them; the
 * server posts one group message per photo once its receipts have arrived.
 *
 * The camera writes to the cache folder, which Android may clear, so a kept
 * photo is moved into the app's own documents folder until it is uploaded.
 */

const FOLDER = 'item-photos';

/** Like WhatsApp: the long side at most 1600 px, JPEG at 70% (about 150 to 300 KB). */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.7;

type Manipulator = typeof import('expo-image-manipulator');
let manipulator: Manipulator | null | undefined;

/**
 * The image module is native. A dev app built before it was added does not
 * have it, and importing it there would crash, so it is loaded lazily and a
 * missing module just means the photo is kept as taken.
 */
function getManipulator(): Manipulator | null {
  if (manipulator !== undefined) return manipulator;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    manipulator = require('expo-image-manipulator') as Manipulator;
  } catch {
    manipulator = null;
  }
  return manipulator;
}

/**
 * Shrink a camera photo the way WhatsApp does before sending: resize the long
 * side to 1600 px and save as JPEG at 70%. Saving re-encodes the pixels only,
 * so hidden metadata such as the GPS position is left behind. Returns the
 * new file's uri, or the original when the image module is not available.
 */
export async function compressLikeWhatsApp(uri: string): Promise<string> {
  const IM = getManipulator();
  if (!IM) return uri;
  try {
    const base = await IM.ImageManipulator.manipulate(uri).renderAsync();
    const long = Math.max(base.width, base.height);
    const image = long > MAX_SIDE
      ? await IM.ImageManipulator.manipulate(base)
          .resize(base.width >= base.height ? { width: MAX_SIDE } : { height: MAX_SIDE })
          .renderAsync()
      : base;
    const out = await image.saveAsync({ compress: JPEG_QUALITY, format: IM.SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri;
  }
}

export function newDeliveryId(): string {
  return `dlv_${nanoid(16)}`;
}

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Move a just-taken photo somewhere it survives until upload. Returns its
 * uri. If moving fails it copies; if that fails too it keeps the camera's
 * own file, which still uploads fine unless Android clears the cache first.
 */
export function keepPhoto(cameraPath: string): string {
  const src = new File(cameraPath.startsWith('file://') ? cameraPath : `file://${cameraPath}`);
  try {
    const dest = new File(folder(), `${nanoid(12)}.jpg`);
    try {
      src.move(dest);
    } catch {
      src.copy(dest);
    }
    return dest.uri;
  } catch {
    return src.uri;
  }
}

/** Throw away a kept photo that will not be used (retake, item removed, cancel). */
export function discardPhoto(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* already gone */
  }
}

export type ItemPhotoPayload = {
  photo_id: string;
  delivery_id: string | null;
  receipt_ids: string[];
  file_uri: string;
  taken_at: number;
};

/** Queue one item's photo, after that item's receipts. Returns its id (for the ticks). */
export async function queueItemPhoto(input: {
  deliveryId: string | null;
  receiptIds: string[];
  photoUri: string;
  takenAt?: number;
}): Promise<string> {
  const payload: ItemPhotoPayload = {
    photo_id: `pho_${nanoid(16)}`,
    delivery_id: input.deliveryId,
    receipt_ids: input.receiptIds,
    file_uri: input.photoUri,
    taken_at: input.takenAt ?? Date.now(),
  };
  await enqueue('item_photo', payload);
  return payload.photo_id;
}

export function photoFileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
