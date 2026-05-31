export type DedupMerged = { id: number; album: string | null; albumartist: string | null };
export type DedupGroup = {
    key: string;
    canonicalId: number;
    canonicalAlbum: string | null;
    canonicalArtist: string | null;
    merged: DedupMerged[];
};
export type DedupReport = {
    dryRun: boolean;
    groupsFound: number;
    albumsMerged: number;
    itemsReassigned: number;
    namesRestored: number;
    groups: DedupGroup[];
};

export type RefetchPreview = {
    count: number;
    items: Array<{
        id: number;
        path: string;
        title: string | null;
        artist: string | null;
        year: number | null;
    }>;
};
export type RefetchDetail = {
    itemId: number;
    path: string;
    oldAlbumId: number | null;
    newAlbumId: number | null;
    filledFields: string[];
    error?: string;
};
export type RefetchReport = {
    probed: number;
    enriched: number;
    relinked: number;
    failed: number;
    details: RefetchDetail[];
};

export type TrashedAlbum = {
    id: number;
    album: string;
    albumartist: string;
    year: number | null;
    artpath: string | null;
    marked_for_deletion: number;
    itemCount: number;
};
export type TrashedItem = {
    id: number;
    title: string | null;
    artist: string | null;
    album: string | null;
    album_id: number | null;
    path: string;
    marked_for_deletion: number;
};
export type TrashResponse = { albums: TrashedAlbum[]; items: TrashedItem[] };
