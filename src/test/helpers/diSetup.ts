import { getContainer, resetContainer } from '../../core/diContainer';
import { registerAdapters, registerServicesToContainer } from '../../core/serviceRegistration';

let initialized = false;

export function setupTestContainer(): void {
    if (initialized) {
        return;
    }
    initialized = true;

    // Tests only need the MySQL adapter; the full adapter set is registered
    // by the production bootstrap in extension.ts.
    registerAdapters(false);
    registerServicesToContainer(getContainer(), '');
}

export function teardownTestContainer(): void {
    resetContainer();
    initialized = false;
}

try {
    setupTestContainer();
} catch (e) {
    console.error('[diSetup] Failed to setup test container:', e);
}
