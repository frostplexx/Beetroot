import * as fs from 'fs';

type Atom = { offset: number; size: number };

function findAtom(buf: Buffer, name: string, start: number, end: number): Atom | null {
    let i = start;
    while (i + 8 <= end) {
        const size = buf.readUInt32BE(i);
        if (size < 8) break;
        if (buf.toString('latin1', i + 4, i + 8) === name) return { offset: i, size };
        i += size;
    }
    return null;
}

function wrapAtom(name: string, content: Buffer): Buffer {
    const size = content.length + 8;
    const buf = Buffer.alloc(size);
    buf.writeUInt32BE(size, 0);
    buf.write(name, 4, 'latin1');
    content.copy(buf, 8);
    return buf;
}

function wrapFullBoxAtom(name: string, content: Buffer): Buffer {
    const size = content.length + 12;
    const buf = Buffer.alloc(size);
    buf.writeUInt32BE(size, 0);
    buf.write(name, 4, 'latin1');
    buf.writeUInt32BE(0, 8); // version 0, flags 0
    content.copy(buf, 12);
    return buf;
}

function spliceBuffer(buf: Buffer, offset: number, deleteBytes: number, insert: Buffer): Buffer {
    const out = Buffer.alloc(buf.length - deleteBytes + insert.length) as unknown as Buffer;
    buf.copy(out, 0, 0, offset);
    insert.copy(out, offset);
    buf.copy(out, offset + insert.length, offset + deleteBytes);
    return out;
}

function updateAtomSize(buf: Buffer, offset: number, delta: number): void {
    buf.writeUInt32BE(buf.readUInt32BE(offset) + delta, offset);
}

// Patch stco/co64 chunk offset tables when moov grows/shrinks and mdat follows moov.
// Required for "fast-start" M4A files (moov before mdat) so audio stays playable.
function fixChunkOffsets(buf: Buffer, moovOffset: number, delta: number): void {
    const moovEnd = moovOffset + buf.readUInt32BE(moovOffset);

    // Only patch if mdat is after moov (fast-start layout)
    let pos = 0;
    let mdatAfterMoov = false;
    while (pos + 8 <= buf.length) {
        const size = buf.readUInt32BE(pos);
        if (size < 8) break;
        if (buf.toString('latin1', pos + 4, pos + 8) === 'mdat' && pos >= moovEnd) {
            mdatAfterMoov = true;
            break;
        }
        pos += size;
    }

    if (!mdatAfterMoov) return;
    patchOffsetsInRange(buf, moovOffset + 8, moovEnd, delta);
}

function patchOffsetsInRange(buf: Buffer, start: number, end: number, delta: number): void {
    const safeEnd = Math.min(end, buf.length);
    let i = start;
    while (i + 8 <= safeEnd) {
        const size = buf.readUInt32BE(i);
        if (size < 8 || i + size > safeEnd) break;
        const name = buf.toString('latin1', i + 4, i + 8);

        if (name === 'stco') {
            const count = buf.readUInt32BE(i + 12);
            for (let j = 0; j < count; j++) {
                const p = i + 16 + j * 4;
                buf.writeUInt32BE(buf.readUInt32BE(p) + delta, p);
            }
        } else if (name === 'co64') {
            const count = buf.readUInt32BE(i + 12);
            for (let j = 0; j < count; j++) {
                const p = i + 16 + j * 8;
                const hi = buf.readUInt32BE(p);
                const lo = buf.readUInt32BE(p + 4);
                const combined = BigInt(hi) * BigInt(0x100000000) + BigInt(lo) + BigInt(delta);
                buf.writeUInt32BE(Number(combined / BigInt(0x100000000)), p);
                buf.writeUInt32BE(Number(combined % BigInt(0x100000000)), p + 4);
            }
        } else if (size > 8) {
            patchOffsetsInRange(buf, i + 8, i + size, delta);
        }

        i += size;
    }
}

export function writeMp4Tags(filePath: string, tags: Record<string, any>): void {
    // Use a separate result variable to avoid Bun's NonSharedBuffer vs Buffer<ArrayBufferLike> conflict
    const original = fs.readFileSync(filePath);

    const moov = findAtom(original, 'moov', 0, original.length);
    if (!moov) throw new Error('Not a valid MP4 file (moov atom not found)');

    const newIlst = wrapAtom('ilst', createIlstBuffer(tags));

    const udta = findAtom(original, 'udta', moov.offset + 8, moov.offset + moov.size);
    const meta = udta ? findAtom(original, 'meta', udta.offset + 8, udta.offset + udta.size) : null;
    const ilst = meta ? findAtom(original, 'ilst', meta.offset + 12, meta.offset + meta.size) : null;

    let delta!: number;
    let result!: Buffer;

    if (ilst) {
        // Replace existing ilst in-place
        delta = newIlst.length - ilst.size;
        result = spliceBuffer(original, ilst.offset, ilst.size, newIlst);
        updateAtomSize(result, meta!.offset, delta);
        updateAtomSize(result, udta!.offset, delta);
        updateAtomSize(result, moov.offset, delta);
    } else if (meta) {
        // Append ilst at end of meta's children
        delta = newIlst.length;
        result = spliceBuffer(original, meta.offset + meta.size, 0, newIlst);
        updateAtomSize(result, meta.offset, delta);
        updateAtomSize(result, udta!.offset, delta);
        updateAtomSize(result, moov.offset, delta);
    } else if (udta) {
        // Create meta+ilst and append at end of udta's children
        const newMeta = wrapFullBoxAtom('meta', newIlst);
        delta = newMeta.length;
        result = spliceBuffer(original, udta.offset + udta.size, 0, newMeta);
        updateAtomSize(result, udta.offset, delta);
        updateAtomSize(result, moov.offset, delta);
    } else {
        // Create udta+meta+ilst and append at end of moov's children
        const newMeta = wrapFullBoxAtom('meta', newIlst);
        const newUdta = wrapAtom('udta', newMeta);
        delta = newUdta.length;
        result = spliceBuffer(original, moov.offset + moov.size, 0, newUdta);
        updateAtomSize(result, moov.offset, delta);
    }

    if (delta !== 0) {
        fixChunkOffsets(result, moov.offset, delta);
    }

    const tmpPath = `${filePath}.tmp`;
    try {
        fs.writeFileSync(tmpPath, result);
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup error */ }
        throw err;
    }
}

function createIlstBuffer(tags: Record<string, any>): Buffer {
    const atoms: Buffer[] = [];

    const mapping: Record<string, string> = {
        title: '\xa9nam',
        artist: '\xa9ART',
        album: '\xa9alb',
        albumArtist: 'aART',
        year: '\xa9day',
        comment: '\xa9cmt',
        composer: '\xa9wrt',
        genre: '\xa9gen',
        lyrics: '\xa9lyr',
    };

    for (const [key, value] of Object.entries(tags)) {
        if (key === 'custom' && typeof value === 'object' && value !== null) {
            for (const [name, val] of Object.entries(value)) {
                atoms.push(createCustomAtom(name, String(val)));
            }
            continue;
        }

        const atomName = mapping[key];
        if (!atomName || value === undefined || value === null) continue;

        const valBuf = Buffer.from(String(value), 'utf8');
        const dataSize = valBuf.length + 16;
        const atomSize = dataSize + 8;

        const atom = Buffer.alloc(atomSize);
        atom.writeUInt32BE(atomSize, 0);
        atom.write(atomName, 4, 'latin1'); // latin1 required for © prefix (0xA9)
        atom.writeUInt32BE(dataSize, 8);
        atom.write('data', 12, 'latin1');
        atom.writeUInt32BE(1, 16); // type: UTF-8 text
        atom.writeUInt32BE(0, 20); // locale
        valBuf.copy(atom, 24);

        atoms.push(atom);
    }

    if (tags.track !== undefined) {
        atoms.push(createNumericAtom('trkn', [0, tags.track || 0, tags.trackTotal || 0, 0]));
    }
    if (tags.disc !== undefined) {
        // disk uses the same 4 × uint16 layout as trkn — trailing pad required
        atoms.push(createNumericAtom('disk', [0, tags.disc || 0, tags.discTotal || 0, 0]));
    }

    return Buffer.concat(atoms);
}

function createCustomAtom(name: string, value: string): Buffer {
    const meanBuf = Buffer.from('com.apple.iTunes', 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(value, 'utf8');

    const meanSize = meanBuf.length + 12;
    const meanAtom = Buffer.alloc(meanSize);
    meanAtom.writeUInt32BE(meanSize, 0);
    meanAtom.write('mean', 4, 'latin1');
    meanAtom.writeUInt32BE(0, 8);
    meanBuf.copy(meanAtom, 12);

    const nameSize = nameBuf.length + 12;
    const nameAtom = Buffer.alloc(nameSize);
    nameAtom.writeUInt32BE(nameSize, 0);
    nameAtom.write('name', 4, 'latin1');
    nameAtom.writeUInt32BE(0, 8);
    nameBuf.copy(nameAtom, 12);

    const dataSize = dataBuf.length + 16;
    const dataAtom = Buffer.alloc(dataSize);
    dataAtom.writeUInt32BE(dataSize, 0);
    dataAtom.write('data', 4, 'latin1');
    dataAtom.writeUInt32BE(1, 8);  // type: text
    dataAtom.writeUInt32BE(0, 12); // locale
    dataBuf.copy(dataAtom, 16);

    const totalSize = meanSize + nameSize + dataSize + 8;
    const atom = Buffer.alloc(totalSize);
    atom.writeUInt32BE(totalSize, 0);
    atom.write('----', 4, 'latin1');
    meanAtom.copy(atom, 8);
    nameAtom.copy(atom, 8 + meanSize);
    dataAtom.copy(atom, 8 + meanSize + nameSize);

    return atom;
}

function createNumericAtom(name: string, values: number[]): Buffer {
    const dataSize = 16 + values.length * 2;
    const atomSize = dataSize + 8;
    const atom = Buffer.alloc(atomSize);
    atom.writeUInt32BE(atomSize, 0);
    atom.write(name, 4, 'latin1');
    atom.writeUInt32BE(dataSize, 8);
    atom.write('data', 12, 'latin1');
    atom.writeUInt32BE(0, 16); // type: implicit/numeric
    atom.writeUInt32BE(0, 20); // locale
    let off = 24;
    for (const v of values) {
        atom.writeUInt16BE(v, off);
        off += 2;
    }
    return atom;
}
