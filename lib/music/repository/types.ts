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
