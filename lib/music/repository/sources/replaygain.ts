import { Item } from "../../database";
import { DataSource } from "../types";
import { spawn } from "child_process";

// Dynamic import for ffmpeg-static since it's a CommonJS module
let ffmpegPath: string | null = null;

async function getFFmpegPath(): Promise<string> {
    if (ffmpegPath) return ffmpegPath;
    const ffmpegStatic = await import("ffmpeg-static");
    ffmpegPath = ffmpegStatic.default;
    if (!ffmpegPath) {
        throw new Error("FFmpeg binary not found. Please ensure ffmpeg-static is installed.");
    }
    return ffmpegPath;
}

interface FFmpegAnalysisResult {
    r128_track_gain?: number;
    rg_track_gain?: number;
    rg_track_peak?: number;
}

/**
 * Analyze audio file using FFmpeg's ebur128 filter to get ReplayGain data
 */
async function analyzeAudioFile(filePath: string): Promise<FFmpegAnalysisResult> {
    const ffmpeg = await getFFmpegPath();

    return new Promise((resolve, reject) => {
        const args = [
            "-i", filePath,
            "-af", "ebur128=framelog=verbose",
            "-f", "null",
            "-"
        ];

        const process = spawn(ffmpeg, args);

        // Set timeout to prevent hung ffmpeg processes
        const timer = setTimeout(() => {
            process.kill('SIGKILL');
        }, 30_000); // 30s timeout for ReplayGain analysis

        let stderr = "";

        process.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        process.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0 && code !== null) {
                reject(new Error(`FFmpeg process exited with code ${code}`));
                return;
            }

            try {
                const result = parseFFmpegOutput(stderr);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });

        process.on("error", (error) => {
            reject(new Error(`Failed to spawn FFmpeg: ${error.message}`));
        });
    });
}

/**
 * Parse FFmpeg ebur128 output to extract loudness values
 * The integrated loudness (I) is used to calculate ReplayGain
 */
function parseFFmpegOutput(output: string): FFmpegAnalysisResult {
    const result: FFmpegAnalysisResult = {};

    // Look for the integrated loudness line:
    // [Parsed_ebur128_0 @ ...] I: -23.0 LUFS
    const integratedMatch = output.match(/I:\s*(-?\d+\.?\d*)\s*LUFS/);

    if (integratedMatch) {
        const integratedLoudness = parseFloat(integratedMatch[1]);

        // R128 gain (in dB relative to -23 LUFS target)
        result.r128_track_gain = -23.0 - integratedLoudness;

        // Convert to classic ReplayGain (uses -18 LUFS target)
        result.rg_track_gain = -18.0 - integratedLoudness;
    }

    // Look for true peak:
    // [Parsed_ebur128_0 @ ...] True peak: -3.2 dBFS
    const peakMatch = output.match(/True peak:\s*(-?\d+\.?\d*)\s*dBFS/);

    if (peakMatch) {
        const truePeak = parseFloat(peakMatch[1]);
        // Convert dBFS to linear scale (peak ratio)
        result.rg_track_peak = Math.pow(10, truePeak / 20);
    }

    return result;
}

export class ReplayGain extends DataSource {
    readonly confidence = 0.9;  // High confidence - calculated from audio data

    constructor() {
        super();
    }

    /**
     * Analyze audio file and extract ReplayGain data using FFmpeg
     */
    async getData(item: Item): Promise<Item> {
        try {
            const analysis = await analyzeAudioFile(item.path);

            return {
                ...item,
                r128_track_gain: analysis.r128_track_gain ?? item.r128_track_gain,
                rg_track_gain: analysis.rg_track_gain ?? item.rg_track_gain,
                rg_track_peak: analysis.rg_track_peak ?? item.rg_track_peak,
            };
        } catch (error) {
            // Silently handle missing files (ENOENT) - expected for duplicates/moved files
            if ((error as any)?.code === 'ENOENT') {
                console.debug(`File not found when analyzing ReplayGain: ${item.path}`);
            } else {
                console.error(`Failed to analyze ReplayGain for ${item.path}:`, error);
            }
            // Return item unchanged if analysis fails
            return item;
        }
    }
}
