import { globalConfig } from "../../config";
import Repository from "./index";

/**
 * Reconciliation Service
 * Manages automatic reconciliation on startup and at regular intervals
 */
class ReconcileService {
    private static instance: ReconcileService;
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private lastRunTime: number | null = null;
    private isReconciling: boolean = false;

    private constructor() {}

    static getInstance(): ReconcileService {
        if (!ReconcileService.instance) {
            ReconcileService.instance = new ReconcileService();
        }
        return ReconcileService.instance;
    }

    /**
     * Start the reconciliation service
     */
    start(): void {
        if (this.isRunning) {
            console.log('[ReconcileService] Already running');
            return;
        }

        this.isRunning = true;
        console.log('[ReconcileService] Starting service');

        // Run on startup if configured
        if (globalConfig.reconcile_on_startup) {
            console.log('[ReconcileService] Running initial reconciliation on startup');
            this.runReconciliation();
        }

        // Set up interval if configured
        if (globalConfig.reconcile_interval && globalConfig.reconcile_interval > 0) {
            const intervalMs = globalConfig.reconcile_interval * 60 * 1000; // Convert minutes to ms
            console.log(`[ReconcileService] Setting up reconciliation interval: ${globalConfig.reconcile_interval} minutes`);

            this.intervalId = setInterval(() => {
                console.log('[ReconcileService] Running scheduled reconciliation');
                this.runReconciliation();
            }, intervalMs);
        } else {
            console.log('[ReconcileService] Reconciliation interval disabled (set to 0 or not configured)');
        }
    }

    /**
     * Stop the reconciliation service
     */
    stop(): void {
        if (!this.isRunning) {
            console.log('[ReconcileService] Not running');
            return;
        }

        console.log('[ReconcileService] Stopping service');
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Run reconciliation (prevents concurrent runs)
     */
    private async runReconciliation(): Promise<void> {
        if (this.isReconciling) {
            console.log('[ReconcileService] Reconciliation already in progress, skipping');
            return;
        }

        this.isReconciling = true;
        const startTime = Date.now();

        try {
            console.log('[ReconcileService] Starting reconciliation...');

            const repository = Repository;
            const result = await repository.reconcile({
                concurrency: 10,
                batchSize: 100,
                progressCallback: (progress) => {
                    // Log progress periodically
                    if (progress.scannedFiles % 1000 === 0 && progress.scannedFiles > 0) {
                        console.log(`[ReconcileService] Progress - ${progress.phase}: scanned ${progress.scannedFiles} files, found ${progress.newFilesFound} new`);
                    }
                }
            });

            const duration = Math.round((Date.now() - startTime) / 1000);
            this.lastRunTime = Date.now();

            console.log('[ReconcileService] Reconciliation complete:', {
                duration: `${duration}s`,
                scannedFiles: result.scannedFiles,
                newFilesImported: result.newFilesImported,
                missingFilesDetected: result.missingFilesDetected,
                artworkFixed: result.artworkFixed,
                deletedItems: result.deletedItems,
                errors: result.errors.length
            });

            if (result.errors.length > 0) {
                console.error('[ReconcileService] Errors during reconciliation:', result.errors.slice(0, 5));
            }

        } catch (error) {
            console.error('[ReconcileService] Reconciliation failed:', error);
        } finally {
            this.isReconciling = false;
        }
    }

    /**
     * Get service status
     */
    getStatus(): {
        isRunning: boolean;
        isReconciling: boolean;
        lastRunTime: number | null;
        intervalMinutes: number;
    } {
        return {
            isRunning: this.isRunning,
            isReconciling: this.isReconciling,
            lastRunTime: this.lastRunTime,
            intervalMinutes: globalConfig.reconcile_interval || 0
        };
    }

    /**
     * Manually trigger reconciliation
     */
    async triggerNow(): Promise<void> {
        console.log('[ReconcileService] Manual reconciliation triggered');
        await this.runReconciliation();
    }
}

export default ReconcileService.getInstance();
