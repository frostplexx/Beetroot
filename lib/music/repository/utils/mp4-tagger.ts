import * as fs from 'fs';

/**
 * A dedicated, lightweight MP4 atom writer for M4A metadata.
 * It specifically handles the 'ilst' atom inside moov.udta.meta.
 * 
 * This is a pure-JS implementation that avoids heavy dependencies.
 */

export function writeMp4Tags(filePath: string, tags: Record<string, any>): void {
    const buffer = fs.readFileSync(filePath);
    
    // Helper to find atom position and size
    function findAtom(buf: Buffer, name: string, start: number, end: number): { offset: number, size: number } | null {
        let i = start;
        while (i < end - 8) {
            const size = buf.readUInt32BE(i);
            const atomName = buf.toString('utf8', i + 4, i + 8);
            if (atomName === name) return { offset: i, size };
            if (size <= 0) break;
            i += size;
        }
        return null;
    }

    const moov = findAtom(buffer, 'moov', 0, buffer.length);
    if (!moov) throw new Error('Not a valid MP4 file (moov atom not found)');

    const udta = findAtom(buffer, 'udta', moov.offset + 8, moov.offset + moov.size);
    if (!udta) throw new Error('udta atom not found');

    const meta = findAtom(buffer, 'meta', udta.offset + 8, udta.offset + udta.size);
    if (!meta) throw new Error('meta atom not found');

    const ilst = findAtom(buffer, 'ilst', meta.offset + 12, meta.offset + meta.size);
    if (!ilst) throw new Error('ilst atom not found');

    // Create new ilst atom
    const newIlstData = createIlstBuffer(tags);
    const newIlstSize = newIlstData.length + 8;
    const newIlst = Buffer.alloc(newIlstSize);
    newIlst.writeUInt32BE(newIlstSize, 0);
    newIlst.write('ilst', 4);
    newIlstData.copy(newIlst, 8);

    // Calculate size difference
    const diff = newIlstSize - ilst.size;

    // Create new file buffer
    const newBuffer = Buffer.alloc(buffer.length + diff);
    buffer.copy(newBuffer, 0, 0, ilst.offset);
    newIlst.copy(newBuffer, ilst.offset);
    buffer.copy(newBuffer, ilst.offset + newIlstSize, ilst.offset + ilst.size);

    // Update sizes of parent atoms
    updateAtomSize(newBuffer, meta.offset, diff);
    updateAtomSize(newBuffer, udta.offset, diff);
    updateAtomSize(newBuffer, moov.offset, diff);

    fs.writeFileSync(filePath, newBuffer);
}

function updateAtomSize(buf: Buffer, offset: number, diff: number) {
    const oldSize = buf.readUInt32BE(offset);
    buf.writeUInt32BE(oldSize + diff, offset);
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
        lyrics: '\xa9lyr'
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
        atom.write(atomName, 4);
        
        // data atom inside the tag atom
        atom.writeUInt32BE(dataSize, 8);
        atom.write('data', 12);
        atom.writeUInt32BE(1, 16); // type flag (1 = text)
        atom.writeUInt32BE(0, 20); // locale
        valBuf.copy(atom, 24);
        
        atoms.push(atom);
    }
    
    // Track and Disc numbers are handled differently (BE uint16s)
    if (tags.track !== undefined) {
        atoms.push(createNumericAtom('trkn', [0, tags.track || 0, tags.trackTotal || 0, 0]));
    }
    if (tags.disc !== undefined) {
        atoms.push(createNumericAtom('disk', [0, tags.disc || 0, tags.discTotal || 0]));
    }

    return Buffer.concat(atoms);
}

function createCustomAtom(name: string, value: string): Buffer {
    const meanBuf = Buffer.from('com.apple.iTunes', 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(value, 'utf8');

    // mean atom
    const meanSize = meanBuf.length + 12;
    const meanAtom = Buffer.alloc(meanSize);
    meanAtom.writeUInt32BE(meanSize, 0);
    meanAtom.write('mean', 4);
    meanAtom.writeUInt32BE(0, 8); // flags
    meanBuf.copy(meanAtom, 12);

    // name atom
    const nameSize = nameBuf.length + 12;
    const nameAtom = Buffer.alloc(nameSize);
    nameAtom.writeUInt32BE(nameSize, 0);
    nameAtom.write('name', 4);
    nameAtom.writeUInt32BE(0, 8); // flags
    nameBuf.copy(nameAtom, 12);

    // data atom
    const dataSize = dataBuf.length + 16;
    const dataAtom = Buffer.alloc(dataSize);
    dataAtom.writeUInt32BE(dataSize, 0);
    dataAtom.write('data', 4);
    dataAtom.writeUInt32BE(1, 8); // type (1 = text)
    dataAtom.writeUInt32BE(0, 12); // locale
    dataBuf.copy(dataAtom, 16);

    const totalSize = meanSize + nameSize + dataSize + 8;
    const atom = Buffer.alloc(totalSize);
    atom.writeUInt32BE(totalSize, 0);
    atom.write('----', 4);
    meanAtom.copy(atom, 8);
    nameAtom.copy(atom, 8 + meanSize);
    dataAtom.copy(atom, 8 + meanSize + nameSize);

    return atom;
}

function createNumericAtom(name: string, values: number[]): Buffer {
    const dataSize = 16 + (values.length * 2);
    const atomSize = dataSize + 8;
    const atom = Buffer.alloc(atomSize);
    atom.writeUInt32BE(atomSize, 0);
    atom.write(name, 4);
    atom.writeUInt32BE(dataSize, 8);
    atom.write('data', 12);
    atom.writeUInt32BE(0, 16); // type flag (0 = reserved/numeric)
    atom.writeUInt32BE(0, 20); // locale
    
    let off = 24;
    for (const v of values) {
        atom.writeUInt16BE(v, off);
        off += 2;
    }
    return atom;
}
