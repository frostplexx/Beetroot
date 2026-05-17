import { parseFile } from 'music-metadata';

export interface LocalTags {
    // Basic metadata
    title: string | null;
    artist: string | null;
    artists: string[] | null;
    album: string | null;
    albumArtist: string | null;

    // Track info
    track: number | null;
    trackTotal: number | null;
    disc: number | null;
    discTotal: number | null;

    // Dates
    year: number | null;
    date: string | null;
    originalDate: string | null;

    // Additional metadata
    genre: string[] | null;
    composer: string[] | null;
    conductor: string | null;
    remixer: string[] | null;
    arranger: string[] | null;
    engineer: string[] | null;
    producer: string[] | null;
    lyricist: string[] | null;
    writer: string[] | null;
    label: string[] | null;

    // Audio properties
    duration: number | null;
    bitrate: number | null;
    sampleRate: number | null;
    bitsPerSample: number | null;
    codec: string | null;
    codecProfile: string | null;
    lossless: boolean | null;
    numberOfChannels: number | null;

    // Album info
    compilation: boolean | null;
    comment: string[] | null;
    description: string | null;

    // Identifiers
    isrc: string[] | null;
    barcode: string | null;
    asin: string | null;
    musicbrainzRecordingId: string | null;
    musicbrainzTrackId: string | null;
    musicbrainzReleaseId: string | null;
    musicbrainzAlbumId: string | null;
    musicbrainzArtistId: string[] | null;
    musicbrainzReleaseGroupId: string | null;
    musicbrainzWorkId: string | null;
    acoustidId: string | null;

    // Ratings and popularity
    rating: number | null;
    bpm: number | null;
    key: string | null;
    mood: string | null;

    // Media
    media: string | null;
    catalogNumber: string[] | null;

    // Album art
    hasArtwork: boolean;
    artworkCount: number;

    // File info
    filePath: string;
}

// Mapping configuration: LocalTags field -> metadata path
const TAG_MAPPING: Record<keyof Omit<LocalTags, 'hasArtwork' | 'artworkCount' | 'filePath'>, string | ((metadata: any) => any)> = {
    // Basic metadata
    title: 'common.title',
    artist: 'common.artist',
    artists: 'common.artists',
    album: 'common.album',
    albumArtist: 'common.albumartist',

    // Track info
    track: (m) => m.common.track?.no,
    trackTotal: (m) => m.common.track?.of,
    disc: (m) => m.common.disk?.no,
    discTotal: (m) => m.common.disk?.of,

    // Dates
    year: 'common.year',
    date: 'common.date',
    originalDate: 'common.originaldate',

    // Additional metadata
    genre: 'common.genre',
    composer: 'common.composer',
    conductor: 'common.conductor',
    remixer: 'common.remixer',
    arranger: 'common.arranger',
    engineer: 'common.engineer',
    producer: 'common.producer',
    lyricist: 'common.lyricist',
    writer: 'common.writer',
    label: 'common.label',

    // Audio properties
    duration: 'format.duration',
    bitrate: 'format.bitrate',
    sampleRate: 'format.sampleRate',
    bitsPerSample: 'format.bitsPerSample',
    codec: 'format.codec',
    codecProfile: 'format.codecProfile',
    lossless: 'format.lossless',
    numberOfChannels: 'format.numberOfChannels',

    // Album info
    compilation: 'common.compilation',
    comment: 'common.comment',
    description: 'common.description',

    // Identifiers
    isrc: 'common.isrc',
    barcode: 'common.barcode',
    asin: 'common.asin',
    musicbrainzRecordingId: 'common.musicbrainz_recordingid',
    musicbrainzTrackId: 'common.musicbrainz_trackid',
    musicbrainzReleaseId: 'common.musicbrainz_albumid',
    musicbrainzAlbumId: 'common.musicbrainz_albumid',
    musicbrainzArtistId: 'common.musicbrainz_artistid',
    musicbrainzReleaseGroupId: 'common.musicbrainz_releasegroupid',
    musicbrainzWorkId: 'common.musicbrainz_workid',
    acoustidId: 'common.acoustid_id',

    // Ratings and popularity
    rating: (m) => m.common.rating?.[0]?.rating,
    bpm: 'common.bpm',
    key: 'common.key',
    mood: 'common.mood',

    // Media
    media: 'common.media',
    catalogNumber: 'common.catalognumber',
};

function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

export async function getLocalTags(filePath: string): Promise<LocalTags> {
    const metadata = await parseFile(filePath);

    // Automatically map all fields from TAG_MAPPING
    const tags: any = {};

    for (const [key, pathOrFn] of Object.entries(TAG_MAPPING)) {
        if (typeof pathOrFn === 'function') {
            tags[key] = pathOrFn(metadata) || null;
        } else {
            tags[key] = getNestedValue(metadata, pathOrFn) || null;
        }
    }

    // Add special computed fields
    tags.hasArtwork = (metadata.common.picture?.length ?? 0) > 0;
    tags.artworkCount = metadata.common.picture?.length ?? 0;
    tags.filePath = filePath;

    return tags as LocalTags;
}


