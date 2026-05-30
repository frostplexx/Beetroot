import { globalConfig } from "../../config";
import db from "../database/db";
import chokidar, { type FSWatcher } from 'chokidar';
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
    private watcher: FSWatcher | null = null;
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

        // Watch configured inbox directories only — never the library itself
        const dirsToWatch = globalConfig.watch_directories ?? [];
        if (dirsToWatch.length === 0) {
            console.log('ReconcileService: no watch_directories configured, file watching disabled');
            return;
        }
        console.log(`ReconcileService: watching ${dirsToWatch.join(', ')}`);

        this.watcher = chokidar.watch(dirsToWatch, {
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
        this.watcher.on('add', (filePath: string) => {
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
     * Run reconciliation in a dedicated Worker thread (prevents concurrent runs).
     * The worker opens its own SQLite connection; WAL mode allows the main thread
     * to keep serving requests while the worker scans and writes.
     */
    private runReconciliation(): Promise<void> {
        if (this.isReconciling) {
            return Promise.resolve();
        }

        this.isReconciling = true;
        this.currentProgress = null;
        this.currentRunStart = Date.now();
        const startTime = this.currentRunStart;

        return new Promise<void>((resolve) => {
            // Dev: Bun resolves .ts directly. Prod: bun build outputs reconcile-worker.js
            // next to server-entry.js (same directory as import.meta.url resolves to).
            const workerUrl = process.env.NODE_ENV === 'production'
                ? new URL('./reconcile-worker.js', import.meta.url)
                : new URL('./reconcile-worker.ts', import.meta.url);

            const worker = new Worker(workerUrl);

            const finish = () => {
                worker.terminate();
                this.isReconciling = false;
                this.currentProgress = null;
                this.currentRunStart = null;
                this.runCounter++;
                resolve();
            };

            worker.onmessage = (event: MessageEvent) => {
                const msg = event.data as { type: string; data?: any };

                if (msg.type === 'started') {
                    this.emit('reconcile', { type: 'started' } as ReconcileEvent);

                } else if (msg.type === 'progress') {
                    this.currentProgress = msg.data;
                    this.emit('reconcile', { type: 'progress', data: msg.data } as ReconcileEvent);

                } else if (msg.type === 'completed') {
                    const result = msg.data;
                    const duration = Math.round((Date.now() - startTime) / 1000);
                    this.lastRunTime = Date.now();

                    const summary = {
                        duration: `${duration}s`,
                        scannedFiles: result.scannedFiles,
                        newFilesImported: result.newFilesImported,
                        missingFilesDetected: result.missingFilesDetected,
                        artworkFixed: result.artworkFixed,
                        deletedItems: result.deletedItems,
                        errors: result.errors?.length ?? 0,
                    };
                    const hasChanges = result.newFilesImported > 0 || result.artworkFixed > 0 || result.deletedItems > 0;

                    this.lastResult = { ...summary, hasChanges, timestamp: Date.now() };

                    if (result.errors?.length > 0) {
                        console.error(`ReconcileService: ${result.errors.length} errors - showing first 5:`);
                        result.errors.slice(0, 5).forEach((err: string) => console.error(`  ${err}`));
                    }

                    this.emit('reconcile', { type: 'completed', data: { ...summary, hasChanges } } as ReconcileEvent);
                    finish();

                } else if (msg.type === 'error') {
                    console.error(`ReconcileService: worker error - ${msg.data?.error}`);
                    this.emit('reconcile', { type: 'error', data: msg.data } as ReconcileEvent);
                    finish();
                }
            };

            worker.onerror = (event: ErrorEvent) => {
                const message = event.message || 'Worker crashed unexpectedly';
                console.error(`ReconcileService: worker crashed - ${message}`);
                this.emit('reconcile', { type: 'error', data: { error: message } } as ReconcileEvent);
                finish();
            };

            worker.postMessage({ type: 'start' });
        });
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
