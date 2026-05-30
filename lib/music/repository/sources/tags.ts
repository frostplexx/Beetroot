import { parseFile, IAudioMetadata } from 'music-metadata';
import { DataSource } from '../types';
import { Item } from '../../database';

// FIXME: remove LocalTags because Technical debt :(
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
            // Basic metadata (use ?? for nullish coalescing - empty string is valid)
            title: common.title ?? item.title,
            artist: common.artist ?? item.artist,
            artists: common.artists?.join(', ') ?? item.artists,
            album: common.album ?? item.album,
            albumartist: common.albumartist ?? item.albumartist,

            // Track info
            track: common.track?.no ?? item.track,
            tracktotal: common.track?.of ?? item.tracktotal,
            disc: common.disk?.no ?? item.disc,
            disctotal: common.disk?.of ?? item.disctotal,

            // Dates (validate to avoid NaN from invalid date strings)
            year: common.year ?? item.year,
            ...this.parseDate(common.date, item),
            ...this.parseOriginalDate(common.originaldate, item),

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

    private parseDate(dateString: string | undefined, item: Item): { month?: number; day?: number } {
        if (!dateString) return { month: item.month ?? undefined, day: item.day ?? undefined };

        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return { month: item.month ?? undefined, day: item.day ?? undefined };
        }

        return {
            month: date.getMonth() + 1,
            day: date.getDate()
        };
    }

    private parseOriginalDate(dateString: string | undefined, item: Item): {
        original_year?: number;
        original_month?: number;
        original_day?: number;
    } {
        if (!dateString) {
            return {
                original_year: item.original_year ?? undefined,
                original_month: item.original_month ?? undefined,
                original_day: item.original_day ?? undefined
            };
        }

        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return {
                original_year: item.original_year ?? undefined,
                original_month: item.original_month ?? undefined,
                original_day: item.original_day ?? undefined
            };
        }

        return {
            original_year: date.getFullYear(),
            original_month: date.getMonth() + 1,
            original_day: date.getDate()
        };
    }
}


