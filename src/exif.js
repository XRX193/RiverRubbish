/**
 * 轻量 EXIF 读取器：从 JPEG 文件头部解析拍摄时间。
 * 优先读取 ExifIFD 的 DateTimeOriginal(0x9003) / CreateDate(0x9004)，
 * 其次回退到 IFD0 的 DateTime(0x0132)。非 JPEG 或解析失败返回 null。
 */

function parseExifDate(text) {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ ](\d{2}):(\d{2}):(\d{2})/.exec(text.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(date.getTime()) ? null : date;
}

function scanIfd(view, tiffStart, ifdOffset, littleEndian, wantedTags) {
  const found = { date: null, exifIfdOffset: 0 };
  if (ifdOffset <= 0 || tiffStart + ifdOffset + 2 > view.byteLength) return found;
  const getUint16 = (offset) => view.getUint16(offset, littleEndian);
  const getUint32 = (offset) => view.getUint32(offset, littleEndian);
  const count = getUint16(tiffStart + ifdOffset);
  for (let i = 0; i < count; i += 1) {
    const entry = tiffStart + ifdOffset + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = getUint16(entry);
    const type = getUint16(entry + 2);
    const num = getUint32(entry + 4);
    if (tag === 0x8769) { // ExifIFD 指针
      found.exifIfdOffset = getUint32(entry + 8);
      continue;
    }
    if (!wantedTags.includes(tag) || type !== 2 || num < 2) continue; // 仅处理 ASCII
    const valueOffset = num > 4 ? tiffStart + getUint32(entry + 8) : entry + 8;
    if (valueOffset + num > view.byteLength) continue;
    let text = '';
    for (let j = 0; j < num - 1; j += 1) text += String.fromCharCode(view.getUint8(valueOffset + j));
    const date = parseExifDate(text);
    if (date && !found.date) found.date = date;
  }
  return found;
}

/** 从 JPEG 文件读取 EXIF 拍摄时间，返回 Date 或 null。 */
export async function readExifCapturedAt(file) {
  if (!file || file.type !== 'image/jpeg') return null;
  const buffer = await file.slice(0, 256 * 1024).arrayBuffer(); // EXIF 位于文件头部
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // 非 JPEG SOI
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    if (size < 2) break;
    if (marker === 0xe1) { // APP1
      const header = offset + 4;
      if (header + 8 > view.byteLength) return null;
      const signature = String.fromCharCode(
        view.getUint8(header), view.getUint8(header + 1),
        view.getUint8(header + 2), view.getUint8(header + 3),
      );
      if (signature !== 'Exif') return null;
      const tiffStart = header + 6;
      const byteOrder = view.getUint16(tiffStart);
      const littleEndian = byteOrder === 0x4949; // 'II'
      if (!littleEndian && byteOrder !== 0x4d4d) return null; // 'MM'
      const firstIfd = view.getUint32(tiffStart + 4, littleEndian);
      const ifd0 = scanIfd(view, tiffStart, firstIfd, littleEndian, [0x0132]);
      if (ifd0.exifIfdOffset) {
        const sub = scanIfd(view, tiffStart, ifd0.exifIfdOffset, littleEndian, [0x9003, 0x9004]);
        if (sub.date) return sub.date;
      }
      return ifd0.date;
    }
    offset += 2 + size;
  }
  return null;
}

const pad = (value) => String(value).padStart(2, '0');

/** 转为 datetime-local 需要的 YYYY-MM-DDTHH:MM 格式（本地时区）。 */
export function toDateTimeLocalValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 转为展示用 YYYY-MM-DD HH:MM 格式（本地时区）。 */
export function toDisplayValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
