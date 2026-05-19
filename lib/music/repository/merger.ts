import { Item } from "../database";
import { SourceResult } from "./types";


export function mergeData<T extends SourceResult>(items: T[]): T {

    let merged: T = items[0];

    for (const item of items) {

        // Skip if no data
        if (item.data == null) continue;
        if (merged.data == null) {
            merged = item;
            continue;
        }

        for (const key in item.data) {
            // If merged data doesn't have this key, add it
            if (merged.data[key] == null) {
                merged.data[key] = item.data[key];
            }

            // If both have this key and it's a string, check for conflicts
            else if (typeof merged.data[key] === 'string' && typeof item.data[key] === 'string') {

                // if the original value is an empty string, take the new one without checking similarity
                if (merged.data[key].trim() === '') {
                    merged.data[key] = item.data[key];
                    continue;
                }


                const distance = calculateLevenshteinDistance(merged.data[key], item.data[key]);
                const maxLength = Math.max(merged.data[key].length, item.data[key].length);
                const similarity = 1 - distance / maxLength;
                
                // If similarity is above threshold i.e. they are nearly identical, use the value from the source with higher confidence
                if (similarity > 0.8) {
                    merged.data[key] = item.confidence > merged.confidence ? item.data[key] : merged.data[key];
                }

                // If similarity is below a threshold, we have a merge conflict. For now, we can log it and keep the value from the source with higher confidence.
                if (similarity <= 0.8) {
                    console.warn(`Merge conflict for key "${key}": "${merged.data[key]}" vs "${item.data[key]}" (similarity: ${similarity.toFixed(2)})`);
                    // merged.data[key] = item.confidence > merged.confidence ? item.data[key] : merged.data[key];
                }

            }
        }
    }

    console.log("===========================")

    console.log(merged.data)

    return merged;
}


function calculateLevenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1].toLowerCase() === b[i - 1].toLowerCase() ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,    // Deletion
                matrix[i][j - 1] + 1,    // Insertion
                matrix[i - 1][j - 1] + cost // Substitution
            );
        }
    }

    return matrix[b.length][a.length];
}
