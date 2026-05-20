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


export interface ReconcileResult {
    scannedFiles: number;
    newFilesFound: number;
    newFilesImported: number;
    missingFilesDetected: number;
    deletedItems: number;
    errors: string[];
}

export interface ReconcileProgress extends ReconcileResult {
    phase: 'scanning' | 'importing' | 'cleanup';
}
