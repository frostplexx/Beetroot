/**
 * Initialize reconciliation service on app startup
 * This file is imported in the root layout to start the background service
 */
import reconcileService from './reconcile-service';

// Start the service when this module is imported
if (typeof window === 'undefined') {
    // Only run on server side
    reconcileService.start();
}

// Export for potential manual control
export { reconcileService };
