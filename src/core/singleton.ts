import { getContainer } from './diContainer'

export function getSingleton<T>(
    token: string,
    factory: () => T,
    instanceRef: { current: T | null },
): T {
    if (!instanceRef.current) {
        const container = getContainer()
        if (container.hasInstance(token)) {
            instanceRef.current = container.get<T>(token)
        } else {
            instanceRef.current = factory()
            container.register(token, instanceRef.current)
        }
    }
    return instanceRef.current
}

export function resetSingleton<T>(
    token: string,
    instanceRef: { current: T | null },
    resetFn?: (instance: T) => void
): void {
    if (instanceRef.current) {
        if (resetFn) {
            resetFn(instanceRef.current)
        }
        try {
            getContainer().unregister(token)
        } catch {
            // container may not have it registered
        }
    }
    instanceRef.current = null
}