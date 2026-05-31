import { Item } from "../database";
import { Cluster } from "./cluster";

export abstract class DataSource {
    abstract readonly confidence: number; // 0.0 to 1.0
    abstract getData(item: Item): Promise<Item>;

    // Override to pre-fetch data for a whole cluster before per-track resolution
    // begins. Album-level sources fetch once; track-level sources (e.g. Lrclib)
    // fire all track requests in parallel. Default is a no-op.
    async seedCluster(_cluster: Cluster): Promise<void> {}
}

export interface SourceResult {
    sourceName: string;
    confidence: number;
    data: Item | null;
    error?: Error;
    duration?: number;
}

// D5: Enhanced result that includes source provenance for tracked fields
export interface MergedResult extends SourceResult {
    sources?: Partial<Record<keyof Item, string>>; // Maps field name to source name
}


export interface ReconcileResult {
    scannedFiles: number;
    newFilesFound: number;
    newFilesImported: number;
    missingFilesDetected: number;
    missingArtworkDetected: number;
    artworkFixed: number;
    deletedItems: number;
    errors: string[];
}

// Distinct phases of the reconcile pipeline. The UI uses these to label the
// current activity so the user can tell scanning from import from retry.
export type ReconcilePhase =
    | 'starting'
    | 'scanning'
    | 'detecting-missing'
    | 'duplicate-check'
    | 'tag-read'
    | 'clustering'
    | 'cluster-import'
    | 'tag-failed-import'
    | 'retry'
    | 'fixing-artwork'
    | 'cleanup'
    | 'finalizing';

export interface ReconcileProgress extends ReconcileResult {
    phase: ReconcilePhase;
    // Short human-readable label for the current activity (rendered as the
    // headline in the live status panel).
    message?: string;
    // Path of the file most recently touched in this phase. Truncated in the UI
    // but useful for spotting which file is wedging things.
    currentPath?: string;
    // Items completed / expected for the current phase. Both undefined means
    // "we don't have a meaningful denominator" (e.g. open-ended scanning).
    processed?: number;
    total?: number;
}

// Individual per-file failure surfaced as it happens, so the UI can show a
// rolling tail of errors without waiting for the whole reconcile to finish.
export interface ReconcileItemError {
    path: string;
    phase: ReconcilePhase;
    error: string;
    timestamp: number;
}
