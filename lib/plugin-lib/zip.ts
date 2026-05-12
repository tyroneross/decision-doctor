// lib/plugin-lib/zip.ts — Minimal STORE-mode ZIP writer.
//
// Plugin/skill bundles are small (≤ 100 files, ≤ 1 MB each per the seeder cap).
// Compression is not load-bearing for usability; STORE-mode keeps the dependency
// surface at zero and the implementation auditable.
//
// References:
//   ZIP file format spec (PKWARE APPNOTE 6.3.10) §4.3 — Local + Central
//   Directory record layouts. We emit Local headers per file, then a Central
//   Directory and EOCD record. No descriptors, no Zip64.

import { Buffer } from "node:buffer";
import crc32 from "node:zlib";

export interface ZipEntry {
  path: string;
  content: string | Buffer;
}

const HAS_CRC32 = typeof (crc32 as { crc32?: unknown }).crc32 === "function";

function crc32Of(buf: Buffer): number {
  if (HAS_CRC32) {
    // Node ≥ 22 ships crc32 in zlib.
    return (crc32 as unknown as { crc32: (b: Buffer) => number }).crc32(buf);
  }
  // Fallback — explicit table-driven CRC32.
  let c: number;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date = new Date()): { date: number; time: number } {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours();
  const minute = d.getMinutes();
  const second = Math.floor(d.getSeconds() / 2);
  const date = ((year - 1980) << 9) | (month << 5) | day;
  const time = (hour << 11) | (minute << 5) | second;
  return { date, time };
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const { date, time } = dosDateTime();

  for (const e of entries) {
    const data = Buffer.isBuffer(e.content)
      ? e.content
      : Buffer.from(e.content, "utf8");
    const nameBuf = Buffer.from(e.path, "utf8");
    const crc = crc32Of(data);

    // --- Local file header ---
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // gp bit flag
    local.writeUInt16LE(0, 8); // method = STORE
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed
    local.writeUInt32LE(data.length, 22); // uncompressed
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    chunks.push(local, nameBuf, data);

    // --- Central directory entry ---
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x031e, 4); // version made by (Unix 3.0)
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // gp bit flag
    cd.writeUInt16LE(0, 10); // method
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0x81a40000, 38); // external attrs (regular file 0644)
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) cdSize += c.length;

  // EOCD
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk w/ central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, ...central, eocd]);
}
