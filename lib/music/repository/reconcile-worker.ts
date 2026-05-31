import Repository from './index';

// Runs inside a Bun Worker thread. The main thread sends { type: 'start' }
// and receives progress/item-error/completed/error messages over postMessage.
//
// Each worker has its own bun:sqlite connection to the database file.
// WAL mode (set in db.ts) allows the main thread to serve reads while
// this worker performs writes.

self.onmessage = async (event: MessageEvent<{ type: string }>) => {
    if (event.data?.type !== 'start') return;

    try {
        self.postMessage({ type: 'started' });

        const result = await Repository.reconcile({
            concurrency: 10,
            batchSize: 100,
            progressCallback: (progress) => {
                self.postMessage({ type: 'progress', data: progress });
            },
            errorCallback: (err) => {
                self.postMessage({ type: 'item-error', data: err });
            },
        });

        self.postMessage({ type: 'completed', data: result });
    } catch (err) {
        self.postMessage({
            type: 'error',
            data: { error: err instanceof Error ? err.message : String(err) },
        });
    }
};
