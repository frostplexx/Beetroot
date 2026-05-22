import { globalConfig } from "../../config";
import Repository from "./index";
import db from "../database/db";
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import * as path from 'path';

export interface ReconcileEvent {
    type: 'started' | 'progress' | 'completed' | 'error';
    data?: any;
}

/**
 * Reconciliation Service
 * Manages automatic reconciliation on startup and at regular intervals
 */
class ReconcileService extends EventEmitter {
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private lastRunTime: number | null = null;
    private lastResult: any = null; // Store last reconciliation result
    private isReconciling: boolean = false;
    private currentProgress: any = null; // Live progress while reconciling
    private currentRunStart: number | null = null;
    private runCounter: number = 0; // Increments after every completed/errored run
    private watcher: chokidar.FSWatcher | null = null;
    private debounceTimeout: NodeJS.Timeout | null = null;

    private constructor() {
        super();
        // Allow up to 50 concurrent SSE connections (multiple browser tabs, etc.)
        this.setMaxListeners(50);
    }

    static getInstance(): ReconcileService {
        // Use global object to ensure singleton persists across Next.js HMR
        const globalAny = global as any;
        if (!globalAny.__reconcileServiceInstance) {
            globalAny.__reconcileServiceInstance = new ReconcileService();
        }
        return globalAny.__reconcileServiceInstance;
    }

    /**
     * Start the reconciliation service
     */
    start(): void {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        console.log('ReconcileService: started');

        // Run on startup if configured. Skip in dev so HMR restarts don't
        // kick off a full library scan every time and starve page requests.
        if (globalConfig.reconcile_on_startup && process.env.NODE_ENV === 'production') {
            this.runReconciliation();
        }

        // Set up interval if configured
        if (globalConfig.reconcile_interval && globalConfig.reconcile_interval > 0) {
            const intervalMs = globalConfig.reconcile_interval * 60 * 1000; // Convert minutes to ms
            console.log(`ReconcileService: interval ${globalConfig.reconcile_interval}m`);

            this.intervalId = setInterval(() => {
                this.runReconciliation();
            }, intervalMs);
        }

        // Watch music directory for file system changes
        const musicDir = globalConfig.music_directory.replace('~', process.env.HOME || '');
        console.log(`ReconcileService: watching ${musicDir}`);

        this.watcher = chokidar.watch(musicDir, {
            ignoreInitial: true,
            ignored: /(^|[\/\\])\../, // Ignore hidden files/directories
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 2000,  // Wait 2s for file to finish writing
                pollInterval: 100
            }
        });

        // Prepared once; reused on every watcher event to suppress paths
        // that we ourselves just moved into the library during an import.
        const pathExistsStmt = db.prepare('SELECT 1 FROM items WHERE path = ? LIMIT 1');

        // Only watch for 'add' events (new files)
        // Ignore: addDir, unlink, unlinkDir, change (these are internal operations)
        this.watcher.on('add', (filePath) => {
            // Only trigger for music files
            const musicExtensions = ['.flac', '.mp3', '.m4a', '.ogg', '.opus', '.wav', '.aiff', '.ape', '.wv'];
            const ext = path.extname(filePath).toLowerCase();

            if (!musicExtensions.includes(ext)) {
                return; // Ignore non-music files
            }

            // adoptItem moves freshly imported files into their canonical
            // location, which trips chokidar a second time. If the path is
            // already in items, the file is a known internal move — skip it.
            try {
                const existing = pathExistsStmt.get(Buffer.from(filePath, 'utf8'));
                if (existing) {
                    return;
                }
            } catch (err) {
                console.error(`ReconcileService: path lookup failed - ${err instanceof Error ? err.message : String(err)}`);
            }

            // Debounce: wait 10 seconds after last change before reconciling
            // This allows time for multiple file copies to complete
            if (this.debounceTimeout) {
                clearTimeout(this.debounceTimeout);
            }

            this.debounceTimeout = setTimeout(() => {
                console.log('ReconcileService: new files detected, starting reconciliation');
                this.runReconciliation();
            }, 10000); // 10 second debounce
        });
    }

    /**
     * Stop the reconciliation service
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }

        console.log('ReconcileService: stopped');
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }

        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }

    /**
     * Run reconciliation (prevents concurrent runs)
     */
    private async runReconciliation(): Promise<void> {
        if (this.isReconciling) {
            return;
        }

        this.isReconciling = true;
        this.currentProgress = null;
        this.currentRunStart = Date.now();
        const startTime = this.currentRunStart;

        try {
            // Emit started event
            this.emit('reconcile', { type: 'started' } as ReconcileEvent);

            const repository = Repository;
            const result = await repository.reconcile({
                concurrency: 10,
                batchSize: 100,
                progressCallback: (progress) => {
                    // Snapshot for pollers, then emit for SSE listeners.
                    this.currentProgress = progress;

                    this.emit('reconcile', {
                        type: 'progress',
                        data: progress
                    } as ReconcileEvent);
                }
            });

            const duration = Math.round((Date.now() - startTime) / 1000);
            this.lastRunTime = Date.now();

            const summary = {
                duration: `${duration}s`,
                scannedFiles: result.scannedFiles,
                newFilesImported: result.newFilesImported,
                missingFilesDetected: result.missingFilesDetected,
                artworkFixed: result.artworkFixed,
                deletedItems: result.deletedItems,
                errors: result.errors.length
            };

            const hasChanges = result.newFilesImported > 0 || result.artworkFixed > 0 || result.deletedItems > 0;

            // Store last result for new SSE / poll responses
            this.lastResult = { ...summary, hasChanges, timestamp: Date.now() };

            if (result.errors.length > 0) {
                console.error(`ReconcileService: ${result.errors.length} errors - showing first 5:`);
                result.errors.slice(0, 5).forEach(err => console.error(`  ${err}`));
            }

            // Emit completed event
            this.emit('reconcile', {
                type: 'completed',
                data: { ...summary, hasChanges }
            } as ReconcileEvent);

        } catch (error) {
            console.error(`ReconcileService: failed - ${error instanceof Error ? error.message : String(error)}`);

            // Emit error event
            this.emit('reconcile', {
                type: 'error',
                data: { error: String(error) }
            } as ReconcileEvent);
        } finally {
            this.isReconciling = false;
            this.currentProgress = null;
            this.currentRunStart = null;
            this.runCounter++;
        }
    }

    /**
     * Get service status
     */
    getStatus(): {
        isRunning: boolean;
        isReconciling: boolean;
        lastRunTime: number | null;
        lastResult: any;
        progress: any;
        runStartedAt: number | null;
        runCounter: number;
        intervalMinutes: number;
    } {
        return {
            isRunning: this.isRunning,
            isReconciling: this.isReconciling,
            lastRunTime: this.lastRunTime,
            lastResult: this.lastResult,
            progress: this.currentProgress,
            runStartedAt: this.currentRunStart,
            runCounter: this.runCounter,
            intervalMinutes: globalConfig.reconcile_interval || 0
        };
    }

    /**
     * Manually trigger reconciliation
     */
    async triggerNow(): Promise<void> {
        console.log('ReconcileService: manual trigger');
        await this.runReconciliation();
    }
}

export default ReconcileService.getInstance();
