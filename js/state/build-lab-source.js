// Read only owned gallery creations; a parcel is a detached PNG snapshot.
import * as db from './db.js';
import { isCreationRow } from './creation-frame.js';
import { normalizeBuildParcel } from '../data/build-lab.js';

export function buildParcelFromGallery(key, row) {
  if (!isCreationRow({ ...row, key })) return null;
  return normalizeBuildParcel({ sourceRef: key, png: row.png, kind: row.kind || 'drawing',
    label: row.kind === 'picture-post' ? 'your picture message' : row.kind === 'family-mural' ? 'your shared picture' : 'your picture', at: row.at });
}
export async function loadBuildParcelPictures() {
  const entries = await db.entries('gallery');
  return entries.map(([key, row]) => buildParcelFromGallery(key, row)).filter(Boolean)
    .sort((a, b) => b.at - a.at || b.sourceRef.localeCompare(a.sourceRef));
}
