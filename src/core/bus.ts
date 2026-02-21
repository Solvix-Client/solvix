import type {
    SolvixEvent,
    SolvixEventType
} from "../types";

type Listener = (event: SolvixEvent) => void;

class SolvixEventBus {

    private listeners = new Map<
        SolvixEventType,
        Set<Listener>
    >();

    on(
        type: SolvixEventType,
        listener: Listener
    ) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }

        this.listeners.get(type)!.add(listener);
    }

    off(
        type: SolvixEventType,
        listener: Listener
    ) {
        this.listeners.get(type)?.delete(listener);
    }

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

export const SolvixBus = new SolvixEventBus();