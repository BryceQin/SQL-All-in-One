import * as assert from 'assert'
import { LRUCache } from '../utils/lruCache'
import { Lazy, lazy, lazyAsync } from '../utils/lazy'
import { DIContainer } from '../core/diContainer'
import { ConfigManager } from '../core/configManager'
import { ErrorHandler, ErrorLevel, ErrorCategory } from '../core/errorHandler'
import { initI18nForTest } from '../i18n'

// ============================================================================
// ConfigManager Tests
// ============================================================================

suite('ConfigManager', () => {

    let configManager: ConfigManager

    setup(() => {
        configManager = new ConfigManager()
    })

    teardown(() => {
        configManager.dispose()
    })

    test('get() returns default value for unconfigured section', () => {
        const result = configManager.get<string>('__test_nonexistent_key__', 'defaultVal')
        assert.strictEqual(result, 'defaultVal')
    })

    test('get() caches value - second call does not re-fetch from vscode config', () => {
        const first = configManager.get<string>('__test_cached_key__', 'cachedDefault')
        const second = configManager.get<string>('__test_cached_key__', 'cachedDefault')
        assert.strictEqual(first, second)
    })

    test('getSection() returns default value', () => {
        const result = configManager.getSection<{ a: number }>('__test_section__', { a: 42 })
        assert.deepStrictEqual(result, { a: 42 })
    })

    test('getSection() caches result', () => {
        const first = configManager.getSection<{ b: string }>('__test_section_cached__', { b: 'hello' })
        const second = configManager.getSection<{ b: string }>('__test_section_cached__', { b: 'hello' })
        assert.deepStrictEqual(first, second)
    })

    test('getSectionKeys() returns defaults for all keys', () => {
        const result = configManager.getSectionKeys<{ x: string; y: number }>(
            'testPrefix',
            ['x', 'y'],
            { x: 'defaultX', y: 99 }
        )
        assert.strictEqual(result.x, 'defaultX')
        assert.strictEqual(result.y, 99)
    })

    test('getSectionKeys() caches result', () => {
        const first = configManager.getSectionKeys<{ k: string }>(
            'testCache',
            ['k'],
            { k: 'v1' }
        )
        const second = configManager.getSectionKeys<{ k: string }>(
            'testCache',
            ['k'],
            { k: 'v2' }
        )
        // cached, so second returns the cached v1, not v2
        assert.strictEqual(first.k, second.k)
    })

    test('registerValidator() rejects invalid values and falls back to default', () => {
        configManager.registerValidator<string>('__test_validator__', (value) => {
            return value === 'valid'
        })

        // First call: value from config doesn't pass validator, so default is used
        const result = configManager.get<string>('__test_validator__', 'fallbackDefault')
        assert.strictEqual(result, 'fallbackDefault')
    })

    test('invalidate() clears cache', () => {
        const first = configManager.get<number>('__test_invalidate__', 1)
        configManager.invalidate()
        // After invalidate, re-fetches - but same default since config not changed
        const second = configManager.get<number>('__test_invalidate__', 1)
        assert.strictEqual(first, second)
    })

    test('onConfigChange() registers listener and returns disposable', () => {
        let called = false
        const disposable = configManager.onConfigChange(() => {
            called = true
        })
        assert.ok(disposable, 'should return a disposable')
        assert.ok(typeof disposable.dispose === 'function', 'disposable should have dispose method')
        assert.strictEqual(called, false, 'listener should not be called on registration')
        disposable.dispose()
    })

    test('onConfigChange() listener can be removed via dispose', () => {
        let callCount = 0
        const disposable = configManager.onConfigChange(() => {
            callCount++
        })
        disposable.dispose()
        // Listener should be removed; no way to trigger change here,
        // but we verify dispose works without error
        assert.strictEqual(callCount, 0)
    })
})

// ============================================================================
// ErrorHandler Tests
// ============================================================================

suite('ErrorHandler', () => {

    let errorHandler: ErrorHandler

    setup(() => {
        initI18nForTest('zh')
        errorHandler = new ErrorHandler()
    })

    test('try() returns function result on success', () => {
        const result = errorHandler.try(
            () => 42,
            'test-context'
        )
        assert.strictEqual(result, 42)
    })

    test('try() catches error and returns fallback', () => {
        const result = errorHandler.try(
            () => { throw new Error('boom') },
            'test-context',
            { fallback: 'safeValue' }
        )
        assert.strictEqual(result, 'safeValue')
    })

    test('try() returns undefined when no fallback and error', () => {
        const result = errorHandler.try(
            () => { throw new Error('boom') },
            'test-context'
        )
        assert.strictEqual(result, undefined)
    })

    test('try() rethrows when rethrow option is true', () => {
        let caught: unknown = null
        try {
            errorHandler.try(
                () => { throw new Error('boom') },
                'test-context',
                { rethrow: true }
            )
        } catch (e: unknown) {
            caught = e
        }
        assert.ok(caught !== null, 'should have thrown')
        assert.ok(typeof caught === 'object' && caught !== null, 'thrown value should be an object')
        const formatterError = caught as { message: string }
        assert.strictEqual(formatterError.message, 'boom')
    })

    test('tryAsync() returns async function result on success', async () => {
        const result = await errorHandler.tryAsync(
            async () => 'asyncResult',
            'async-context'
        )
        assert.strictEqual(result, 'asyncResult')
    })

    test('tryAsync() catches async error and returns fallback', async () => {
        const result = await errorHandler.tryAsync(
            async () => { throw new Error('async boom') },
            'async-context',
            { fallback: 'asyncFallback' }
        )
        assert.strictEqual(result, 'asyncFallback')
    })

    test('tryAsync() rethrows async error when rethrow is true', async () => {
        let caught = false
        try {
            await errorHandler.tryAsync(
                async () => { throw new Error('async rethrow boom') },
                'async-context',
                { rethrow: true }
            )
        } catch (e: unknown) {
            caught = true
            assert.ok(e instanceof Error || typeof e === 'object')
        }
        assert.ok(caught, 'should have thrown')
    })

    test('handle() returns FormatterError with correct shape', () => {
        const err = new Error('test error')
        const result = errorHandler.handle(err, 'handle-context', ErrorLevel.WARNING, ErrorCategory.CONFIG)

        assert.strictEqual(result.message, 'test error')
        assert.strictEqual(result.context, 'handle-context')
        assert.strictEqual(result.level, ErrorLevel.WARNING)
        assert.strictEqual(result.category, ErrorCategory.CONFIG)
        assert.ok(typeof result.timestamp === 'number')
        assert.ok(result.stack !== undefined)
    })

    test('normalizeError handles Error instance', () => {
        const err = new Error('instance error')
        const result = errorHandler.handle(err, 'ctx')

        assert.strictEqual(result.message, 'instance error')
        assert.strictEqual(result.originalError, err)
        assert.ok(result.stack !== undefined)
    })

    test('normalizeError handles string error', () => {
        const result = errorHandler.handle('plain string error', 'ctx')

        assert.strictEqual(result.message, 'plain string error')
        assert.strictEqual(result.originalError, 'plain string error')
    })

    test('normalizeError handles object error', () => {
        const obj = { code: 500, detail: 'server error' }
        const result = errorHandler.handle(obj, 'ctx')

        assert.ok(result.message.includes('code'))
        assert.ok(result.message.includes('detail'))
        assert.strictEqual(result.originalError, obj)
    })

    test('normalizeError handles null/undefined gracefully', () => {
        const result = errorHandler.handle(null, 'ctx')

        assert.strictEqual(result.message, 'null')
        assert.strictEqual(result.originalError, null)
    })

    test('handle() uses default level and category', () => {
        const result = errorHandler.handle('defaults test', 'ctx')

        assert.strictEqual(result.level, ErrorLevel.ERROR)
        assert.strictEqual(result.category, ErrorCategory.FEATURE)
    })

    test('getHistory() returns error history', () => {
        errorHandler.handle('first error', 'ctx1')
        errorHandler.handle('second error', 'ctx2')

        const history = errorHandler.getHistory()
        assert.strictEqual(history.length, 2)
        assert.strictEqual(history[0].message, 'first error')
        assert.strictEqual(history[1].message, 'second error')
    })

    test('clearHistory() clears error history', () => {
        errorHandler.handle('first', 'ctx1')
        errorHandler.clearHistory()
        const history = errorHandler.getHistory()
        assert.strictEqual(history.length, 0)
    })

    test('addListener() returns unsubscribe function', () => {
        const unsub = errorHandler.addListener(() => { /* no-op listener */ })
        assert.strictEqual(typeof unsub, 'function')
        unsub()
    })

    test('addListener() is called on error', () => {
        let received: string | null = null
        errorHandler.addListener((err) => {
            received = err.message
        })
        errorHandler.handle('listener test', 'ctx')

        assert.strictEqual(received, 'listener test')
    })
})

// ============================================================================
// Lazy Tests
// ============================================================================

suite('Lazy', () => {

    test('get() delays initialization - factory not called until first get', () => {
        let factoryCalled = false
        const lz = new Lazy(() => {
            factoryCalled = true
            return 'value'
        })

        assert.strictEqual(factoryCalled, false, 'factory should not be called on construction')
        lz.get()
        assert.strictEqual(factoryCalled, true, 'factory should be called on first get()')
    })

    test('get() calls factory only once - returns same instance', () => {
        let callCount = 0
        const lz = new Lazy(() => {
            callCount++
            return { data: 'obj' }
        })

        const first = lz.get()
        const second = lz.get()
        const third = lz.get()

        assert.strictEqual(callCount, 1, 'factory should be called exactly once')
        assert.strictEqual(first, second)
        assert.strictEqual(second, third)
    })

    test('isInitialized is false initially', () => {
        const lz = new Lazy(() => 'val')
        assert.strictEqual(lz.isInitialized, false)
    })

    test('isInitialized is true after first get()', () => {
        const lz = new Lazy(() => 'val')
        lz.get()
        assert.strictEqual(lz.isInitialized, true)
    })

    test('reset() clears initialized state', () => {
        let callCount = 0
        const lz = new Lazy(() => {
            callCount++
            return callCount
        })

        assert.strictEqual(lz.get(), 1)
        assert.strictEqual(lz.isInitialized, true)

        lz.reset()

        assert.strictEqual(lz.isInitialized, false)
        assert.strictEqual(lz.get(), 2, 'after reset, factory should be called again')
        assert.strictEqual(callCount, 2)
    })

    test('dispose() calls dispose on initialized object', () => {
        let disposed = false
        const obj = {
            data: 'test',
            dispose: () => { disposed = true }
        }
        const lz = new Lazy(() => obj)
        lz.get() // initialize

        assert.strictEqual(lz.isInitialized, true)
        lz.dispose()

        assert.strictEqual(disposed, true, 'dispose should call the object dispose method')
        assert.strictEqual(lz.isInitialized, false, 'should reset initialized state')
    })

    test('dispose() works when object has no dispose method', () => {
        const lz = new Lazy(() => 'plain value')
        lz.get()

        // should not throw
        lz.dispose()
        assert.strictEqual(lz.isInitialized, false)
    })

    test('dispose() does nothing when not initialized', () => {
        const lz = new Lazy(() => ({ dispose: () => { throw new Error('should not be called') } }))
        // should not throw - dispose is only called when initialized
        lz.dispose()
        assert.strictEqual(lz.isInitialized, false)
    })

    test('lazy() helper creates Lazy instance', () => {
        const lz = lazy(() => 42)
        assert.ok(lz instanceof Lazy)
        assert.strictEqual(lz.get(), 42)
    })

    test('lazyAsync get() works', async () => {
        let callCount = 0
        const laz = lazyAsync(async () => {
            callCount++
            return 'async val'
        })
        const result = await laz.get()
        assert.strictEqual(result, 'async val')
        assert.strictEqual(callCount, 1)
        assert.strictEqual(laz.isInitialized, true)
    })
})

// ============================================================================
// LRUCache Tests
// ============================================================================

suite('LRUCache', () => {

    test('set() and get() basic read/write', () => {
        const cache = new LRUCache<string, number>()
        cache.set('a', 1)
        cache.set('b', 2)

        assert.strictEqual(cache.get('a'), 1)
        assert.strictEqual(cache.get('b'), 2)
    })

    test('get() returns undefined for non-existent key', () => {
        const cache = new LRUCache<string, number>()
        assert.strictEqual(cache.get('nonexistent'), undefined)
    })

    test('LRU eviction - evicts oldest entry when exceeding maxSize', () => {
        const cache = new LRUCache<number, string>({ maxSize: 3 })

        cache.set(1, 'one')
        cache.set(2, 'two')
        cache.set(3, 'three')
        cache.set(4, 'four') // should evict key 1

        assert.strictEqual(cache.get(1), undefined, 'key 1 should be evicted')
        assert.strictEqual(cache.get(2), 'two')
        assert.strictEqual(cache.get(3), 'three')
        assert.strictEqual(cache.get(4), 'four')
    })

    test('LRU - recently accessed entries are not evicted', () => {
        const cache = new LRUCache<number, string>({ maxSize: 3 })

        cache.set(1, 'one')
        cache.set(2, 'two')
        cache.set(3, 'three')

        // access key 1 to mark it as recently used
        cache.get(1)

        cache.set(4, 'four') // should evict key 2 (not key 1 since it was recently accessed)

        assert.strictEqual(cache.get(1), 'one', 'key 1 should still exist')
        assert.strictEqual(cache.get(2), undefined, 'key 2 should be evicted')
        assert.strictEqual(cache.get(3), 'three')
        assert.strictEqual(cache.get(4), 'four')
    })

    test('set() overwrites existing key without affecting capacity', () => {
        const cache = new LRUCache<string, string>({ maxSize: 2 })

        cache.set('a', 'first')
        cache.set('b', 'second')
        cache.set('a', 'updated') // overwrite
        cache.set('c', 'third')   // key b should be evicted, not a

        assert.strictEqual(cache.get('a'), 'updated', 'key a should be updated')
        assert.strictEqual(cache.get('b'), undefined, 'key b should be evicted')
        assert.strictEqual(cache.get('c'), 'third')
        assert.strictEqual(cache.size(), 2)
    })

    test('TTL expiration - get() returns undefined after maxAge', async () => {
        const cache = new LRUCache<string, string>({ maxAge: 50 })

        cache.set('key', 'value')
        assert.strictEqual(cache.get('key'), 'value')

        // wait for expiration
        await new Promise(resolve => setTimeout(resolve, 60))

        assert.strictEqual(cache.get('key'), undefined, 'should expire after maxAge')
    })

    test('has() returns true for existing non-expired key', () => {
        const cache = new LRUCache<string, string>()

        cache.set('k', 'v')
        assert.strictEqual(cache.has('k'), true)
    })

    test('has() returns false for non-existent key', () => {
        const cache = new LRUCache<string, string>()

        assert.strictEqual(cache.has('no'), false)
    })

    test('has() returns false for expired key', async () => {
        const cache = new LRUCache<string, string>({ maxAge: 50 })

        cache.set('k', 'v')
        await new Promise(resolve => setTimeout(resolve, 60))

        assert.strictEqual(cache.has('k'), false)
    })

    test('delete() removes entry', () => {
        const cache = new LRUCache<string, number>()

        cache.set('x', 100)
        assert.strictEqual(cache.get('x'), 100)

        cache.delete('x')
        assert.strictEqual(cache.get('x'), undefined)
    })

    test('clear() removes all entries', () => {
        const cache = new LRUCache<string, number>()

        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('c', 3)

        cache.clear()

        assert.strictEqual(cache.size(), 0)
        assert.strictEqual(cache.get('a'), undefined)
        assert.strictEqual(cache.get('b'), undefined)
        assert.strictEqual(cache.get('c'), undefined)
    })

    test('size() returns correct count', () => {
        const cache = new LRUCache<string, number>()

        assert.strictEqual(cache.size(), 0)
        cache.set('a', 1)
        assert.strictEqual(cache.size(), 1)
        cache.set('b', 2)
        assert.strictEqual(cache.size(), 2)
        cache.delete('a')
        assert.strictEqual(cache.size(), 1)
    })

    test('default maxSize and maxAge are used', () => {
        const cache = new LRUCache<string, number>()

        // maxSize defaults to 100, maxAge defaults to 30000
        for (let i = 0; i < 200; i++) {
            cache.set(`key${i}`, i)
        }

        // Only the last 100 entries should remain
        assert.ok(cache.size() <= 100)
    })
})

// ============================================================================
// DIContainer Tests
// ============================================================================

suite('DIContainer', () => {

    let container: DIContainer

    setup(() => {
        container = new DIContainer()
    })

    test('register() and get() basic registration and retrieval', () => {
        const service = { name: 'testService' }
        container.register('TestService', service)

        const retrieved = container.get<{ name: string }>('TestService')
        assert.strictEqual(retrieved, service)
        assert.strictEqual(retrieved.name, 'testService')
    })

    test('get() throws for unregistered token', () => {
        assert.throws(
            () => container.get('NotRegistered'),
            /Service not registered: NotRegistered/
        )
    })

    test('has() returns true for registered token', () => {
        container.register('MyToken', { data: 1 })
        assert.strictEqual(container.has('MyToken'), true)
    })

    test('has() returns false for unregistered token', () => {
        assert.strictEqual(container.has('Unknown'), false)
    })

    test('disposeAll() calls dispose on all services that have dispose method', () => {
        let disposed1 = false
        let disposed2 = false
        const svc1 = {
            name: 'svc1',
            dispose: () => { disposed1 = true }
        }
        const svc2 = {
            name: 'svc2',
            dispose: () => { disposed2 = true }
        }

        container.register('svc1', svc1)
        container.register('svc2', svc2)

        container.disposeAll()

        assert.strictEqual(disposed1, true)
        assert.strictEqual(disposed2, true)
        assert.strictEqual(container.has('svc1'), false)
        assert.strictEqual(container.has('svc2'), false)
    })

    test('disposeAll() skips services without dispose method', () => {
        const plainObj = { name: 'plain' }
        container.register('plain', plainObj)

        // should not throw
        container.disposeAll()
        assert.strictEqual(container.has('plain'), false)
    })

    test('disposeAll() handles null/undefined services', () => {
        container.register('nullSvc', null)
        container.register('undefinedSvc', undefined)

        // should not throw
        container.disposeAll()
        assert.strictEqual(container.has('nullSvc'), false)
        assert.strictEqual(container.has('undefinedSvc'), false)
    })

    test('clear() removes all services without calling dispose', () => {
        let disposed = false
        const svc = {
            name: 'svc',
            dispose: () => { disposed = true }
        }

        container.register('svc', svc)
        container.clear()

        assert.strictEqual(disposed, false, 'clear() should not call dispose')
        assert.strictEqual(container.has('svc'), false)
    })

    test('register() overwrites existing token', () => {
        container.register('token', 'first')
        container.register('token', 'second')

        const result = container.get<string>('token')
        assert.strictEqual(result, 'second')
    })
})