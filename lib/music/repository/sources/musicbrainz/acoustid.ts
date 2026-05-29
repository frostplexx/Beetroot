import * as path from "path";
import { globalConfig } from "../../../../config";

export interface ChromaPrintResult {
    duration: number;
    fingerprint: string;
}

export interface AcoustIDRecording {
    id: string;
    title?: string;
    duration?: number;
    artists?: AcoustIDArtist[];
    releasegroups?: AcoustIDReleaseGroup[];
}

export interface AcoustIDArtist {
    id: string;
    name: string;
}

export interface AcoustIDReleaseGroup {
    id: string;
    title: string;
    type?: string;
    secondarytypes?: string[];
}

export interface AcoustIDResult {
    id: string;
    score: number;
    recordings?: AcoustIDRecording[];
}

export interface AcoustIDResponse {
    status: 'ok' | 'error';
    results?: AcoustIDResult[];
    error?: AcoustIDError;
}

export interface AcoustIDError {
    code: number;
    message: string;
}

/// Get the chromaprint fingerprint and duration of a song using the fpcalc command-line tool. Returns a promise that resolves to a ChromaPrintResult object containing the fingerprint and duration.
/// @param filePath The path to the audio file to analyze.
/// @returns A promise that resolves to a ChromaPrintResult object containing the fingerprint and duration of the song.
/// Example usage:
/// getAcoustidFingerprint('/path/to/song.mp3').then(result => {
///     console.log('Fingerprint:', result.fingerprint);
///     console.log('Duration:', result.duration);
/// }).catch(error => {
///     console.error(error);
/// });
export function getAcoustidFingerprint(filePath: string): Promise<ChromaPrintResult> {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');

        // Try to find fpcalc - prefer bundled binary from project root
        const projectRoot = process.cwd();
        const fpcalcPath = path.join(projectRoot, 'lib', 'music', 'binaries', 'chromaprint', 'fpcalc');

        const fpcalc = spawn(fpcalcPath, ['-length', '120', filePath]);

        let output = '';
        fpcalc.stdout.on('data', (data: Buffer) => {
            output += data.toString();
        });

        let stderrOutput = '';
        fpcalc.stderr.on('data', (data: Buffer) => {
            stderrOutput += data.toString();
            // Don't spam console with errors during processing
        });

        fpcalc.on('close', (code: number) => {
            if (code !== 0) {
                // Check if it's a known unsupported format issue
                if (stderrOutput.includes('Not yet implemented in FFmpeg') ||
                    stderrOutput.includes('Error reading from the audio source')) {
                    reject(new Error(`Audio format not supported by fpcalc (FFmpeg limitation)`));
                } else {
                    reject(new Error(`fpcalc exited with code ${code}: ${stderrOutput}`));
                }
                return;
            }

            // Return duration and fingerprint as ChromaPrintResult
            const lines = output.split('\n');
            let duration: number | null = null;
            let fingerprint: string | null = null;

            for (const line of lines) {
                if (line.startsWith('DURATION=')) {
                    duration = parseInt(line.replace('DURATION=', '').trim(), 10);
                }
                if (line.startsWith('FINGERPRINT=')) {
                    fingerprint = line.replace('FINGERPRINT=', '').trim();
                }
            }

            if (duration !== null && fingerprint !== null) {
                resolve({
                    fingerprint: fingerprint,
                    duration: duration
                } as ChromaPrintResult);
            } else {
                reject(new Error('Failed to parse fpcalc output'));
            }
        });
    });
}


/// Look up a song on AcoustID using its fingerprint and duration. Returns a promise that resolves to the AcoustID lookup result.
/// Note: You will need to sign up for an AcoustID API key and include it in the request headers for this function to work.
/// @param fingerprint The chromaprint fingerprint of the song.
/// @param duration The duration of the song in seconds.
/// @returns A promise that resolves to the AcoustID lookup result.
/// Example usage:
/// acoustIDLookup('AQADhH8AAB9mQAA', 240).then(result => {
///     console.log(result);
/// }).catch(error => {
///     console.error(error);
/// });
export function acoustIDLookup(fingerprint: string, duration: number): Promise<AcoustIDResponse> {
    if (!globalConfig.acoustid_api_key) {
        return Promise.reject(new Error('AcoustID API key not configured'));
    }

    const lookupURL = `https://api.acoustid.org/v2/lookup`;
    const params = new URLSearchParams({
        client: globalConfig.acoustid_api_key,
        format: 'json',
        duration: duration.toString(),
        fingerprint: fingerprint,
        meta: 'recordings'
    });

    return fetch(lookupURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
    })
        .then(async response => {
            if (!response.ok) {
                return response.text().then(body => {
                    throw new Error(`AcoustID lookup failed with status ${response.status}: ${body}`);
                });
            }
            return (response.json())
        })
        .catch(error => {
            console.debug(`AcoustID lookup error: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        });
}


