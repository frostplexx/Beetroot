import { parseFile, IAudioMetadata } from 'music-metadata';
import { DataSource } from '../types';
import { Item } from '../../database';

export interface LocalTags {
    metadata: IAudioMetadata;
    filePath: string;
}

export async function getLocalTags(filePath: string): Promise<LocalTags> {
    const metadata = await parseFile(filePath);

    return {
        metadata,
        filePath
    };
}

export class LocalTagsSource extends DataSource {
    readonly confidence = 0.6;  // High but not perfect - tags can be user-edited or wrong

    async getData(item: Item): Promise<Item> {
        const { metadata } = await getLocalTags(item.path);
        const { format, common } = metadata;

        return {
            ...item,
            // Basic metadata
            title: common.title || item.title,
            artist: common.artist || item.artist,
            artists: common.artists?.join(', ') || item.artists,
            album: common.album || item.album,
            albumartist: common.albumartist || item.albumartist,

            // Track info
            track: common.track?.no ?? item.track,
            tracktotal: common.track?.of ?? item.tracktotal,
            disc: common.disk?.no ?? item.disc,
            disctotal: common.disk?.of ?? item.disctotal,

            // Dates
            year: common.year ?? item.year,
            month: common.date ? new Date(common.date).getMonth() + 1 : item.month,
            day: common.date ? new Date(common.date).getDate() : item.day,
            original_year: common.originaldate ? new Date(common.originaldate).getFullYear() : item.original_year,
            original_month: common.originaldate ? new Date(common.originaldate).getMonth() + 1 : item.original_month,
            original_day: common.originaldate ? new Date(common.originaldate).getDate() : item.original_day,

            // Additional metadata
            genres: common.genre || item.genres,
            composers: common.composer?.join(', ') || item.composers,
            remixers: common.remixer?.join(', ') || item.remixers,
            arrangers: common.arranger?.join(', ') || item.arrangers,
            lyricists: common.lyricist?.join(', ') || item.lyricists,
            label: common.label?.join(', ') || item.label,

            // Audio properties
            length: format.duration ?? item.length,
            bitrate: format.bitrate ?? item.bitrate,
            samplerate: format.sampleRate ?? item.samplerate,
            bitdepth: format.bitsPerSample ?? item.bitdepth,
            format: format.codec || item.format,
            channels: format.numberOfChannels ?? item.channels,

            // Album info
            comp: common.compilation ? 1 : (common.compilation === false ? 0 : item.comp),
            comments: common.comment?.join('; ') || item.comments,

            // Identifiers
            isrc: common.isrc?.join(', ') || item.isrc,
            barcode: common.barcode || item.barcode,
            asin: common.asin || item.asin,
            mb_trackid: common.musicbrainz_recordingid || item.mb_trackid,
            mb_releasetrackid: common.musicbrainz_trackid || item.mb_releasetrackid,
            mb_albumid: common.musicbrainz_albumid || item.mb_albumid,
            mb_artistid: common.musicbrainz_artistid?.[0] || item.mb_artistid,
            mb_artistids: common.musicbrainz_artistid?.join(', ') || item.mb_artistids,
            mb_releasegroupid: common.musicbrainz_releasegroupid || item.mb_releasegroupid,
            mb_workid: common.musicbrainz_workid || item.mb_workid,
            acoustid_id: common.acoustid_id || item.acoustid_id,

            // Ratings and popularity
            bpm: common.bpm ?? item.bpm,
            initial_key: common.key || item.initial_key,

            // Media
            media: common.media || item.media,
            catalognum: common.catalognumber?.join(', ') || item.catalognum,
        };
    }
}


