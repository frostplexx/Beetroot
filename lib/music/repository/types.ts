import { Item } from "../database";

export abstract class DataSource {
    abstract readonly confidence: number; // 0.0 to 1.0
    abstract getData(item: Item): Promise<Item>;
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

export interface ReconcileProgress extends ReconcileResult {
    phase: 'scanning' | 'importing' | 'fixing-artwork' | 'cleanup';
}
