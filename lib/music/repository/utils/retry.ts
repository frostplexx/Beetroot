/**
 * Shared retry helper for data sources
 *
 * Provides configurable retry logic with exponential/linear/constant backoff,
 * jitter, and customizable retry predicates for HTTP and network errors.
 */

export interface RetryOptions {
    maxRetries?: number;           // Default: 3
    backoff?: BackoffStrategy;     // Default: 'exponential'
    baseDelay?: number;            // Default: 1000ms
    maxDelay?: number;             // Default: 120000ms (2 minutes)
    jitter?: boolean;              // Default: true (prevents thundering herd)
    shouldRetry?: (error: Error) => boolean;
    onRetry?: (error: Error, attempt: number) => void;
}

export type BackoffStrategy = 'exponential' | 'linear' | 'constant';

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>> = {
    maxRetries: 3,
    backoff: 'exponential',
    baseDelay: 1000,
    maxDelay: 120000,
    jitter: true,
};

/**
 * Sleep for a given number of milliseconds
 */
async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate the delay for a given retry attempt
 */
function calculateDelay(
    attempt: number,
    strategy: BackoffStrategy,
    baseDelay: number,
    maxDelay: number,
    jitter: boolean
): number {
    let delay: number;

    switch (strategy) {
        case 'exponential':
            // 1s, 2s, 4s, 8s, 16s, 32s, 64s, 120s (capped)
            delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            break;

        case 'linear':
            // 1s, 2s, 3s, 4s, ... up to maxDelay
            delay = Math.min(baseDelay * (attempt + 1), maxDelay);
            break;

        case 'constant':
            // Always baseDelay
            delay = baseDelay;
            break;
    }

    if (jitter) {
        // Add ±25% jitter to prevent thundering herd
        const jitterAmount = delay * 0.25;
        delay += (Math.random() * 2 - 1) * jitterAmount;
    }

    return Math.max(0, Math.floor(delay));
}

/**
 * Extract HTTP status code from error message or object
 */
export function extractHttpStatus(error: Error): number | null {
    // Pattern 1: "API error 404: ..." or "MusicBrainz API error 404: ..."
    const apiMatch = error.message.match(/API error (\d{3})/i);
    if (apiMatch) return parseInt(apiMatch[1], 10);

    // Pattern 2: "status 404" or "Status: 404"
    const statusMatch = error.message.match(/status[:\s]+(\d{3})/i);
    if (statusMatch) return parseInt(statusMatch[1], 10);

    // Pattern 3: Check if error has status property (Response object)
    if ('status' in error && typeof (error as any).status === 'number') {
        return (error as any).status;
    }

    return null;
}

/**
 * Detect if an error is a network error (connection issues, timeouts, DNS failures)
 */
export function isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Common network error patterns
    const networkPatterns = [
        'fetch',
        'network',
        'econnreset',
        'econnrefused',
        'etimedout',
        'enetunreach',
        'ehostunreach',
        'dns',
        'socket',
        'timeout',
        'connection',
    ];

    return networkPatterns.some(pattern => message.includes(pattern));
}

/**
 * Default retry predicate: retry on server errors, rate limits, and network errors
 */
export function isRetryableHttpError(error: Error): boolean {
    const status = extractHttpStatus(error);

    if (!status) {
        // No HTTP status means network error - retry
        return isNetworkError(error);
    }

    // Retry on server errors and rate limits
    if (status >= 500) return true;           // 5xx server errors
    if (status === 429) return true;          // Too Many Requests
    if (status === 503) return true;          // Service Unavailable
    if (status === 502) return true;          // Bad Gateway
    if (status === 504) return true;          // Gateway Timeout

    // Don't retry client errors (except 429 which is handled above)
    if (status >= 400 && status < 500) return false;

    return false;
}

/**
 * Execute a function with retry logic
 *
 * @param fn Function to execute
 * @param options Retry configuration
 * @returns Promise resolving to the function's result
 * @throws The last error encountered if all retries fail
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: Error;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if we should retry
            const shouldRetry = opts.shouldRetry?.(lastError)
                ?? isRetryableHttpError(lastError);

            const isLastAttempt = attempt === opts.maxRetries;

            if (!shouldRetry || isLastAttempt) {
                throw lastError;
            }

            // Calculate delay and wait
            const delay = calculateDelay(attempt, opts.backoff, opts.baseDelay, opts.maxDelay, opts.jitter);

            // Call retry hook if provided
            opts.onRetry?.(lastError, attempt + 1);

            await sleep(delay);
        }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError!;
}
