import type {
    SolvixEvent,
    SolvixEventType
} from "../types";

type Listener = (event: SolvixEvent) => void;

/**
 * Typed pub/sub event bus for Solvix request lifecycle events.
 *
 * Every request emits events at key stages:
 * - `request:start` — when a request begins processing
 * - `request:retry` — before retrying after a failure
 * - `request:complete` — on successful response
 * - `request:error` — on permanent failure
 * - `health:change` — when health checker detects a state change
 * - `request:shadow*` — shadow request lifecycle events
 *
 * @example
 * ```ts
 * import { SolvixBus } from "@adityadev13/solvix";
 *
 * SolvixBus.on("request:complete", (event) => {
 *   console.log(`[${event.context.meta.correlationId}] ${event.context.url}`);
 * });
 * ```
 */
class SolvixEventBus {

    private listeners = new Map<
        SolvixEventType,
        Set<Listener>
    >();

    /**
     * Subscribe to a request lifecycle event.
     * @param type - Event type to listen for.
     * @param listener - Callback receiving the event with context and metadata.
     *
     * @example
     * ```ts
     * SolvixBus.on("request:error", (e) => {
     *   Sentry.captureException(e.context.error);
     * });
     * ```
     */
    on(
        type: SolvixEventType,
        listener: Listener
    ) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }

        this.listeners.get(type)!.add(listener);
    }

    /**
     * Unsubscribe from a request lifecycle event.
     * @param type - Event type to stop listening for.
     * @param listener - The same callback reference passed to `on()`.
     */
    off(
        type: SolvixEventType,
        listener: Listener
    ) {
        this.listeners.get(type)?.delete(listener);
    }

    /** @internal Emit an event to all subscribers. */
    emit(event: SolvixEvent) {
        const handlers = this.listeners.get(event.type);
        if (!handlers) return;

        for (const handler of handlers) {
            try {
                handler(event);
            } catch (error) {
                // never break request flow
            }
        }
    }
}

/** Singleton event bus instance. Subscribe to request lifecycle events. */
export const SolvixBus = new SolvixEventBus();