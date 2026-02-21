import type { SolvixContext, SolvixResponse } from "../types";
import { SolvixBus } from "../core/bus";

export async function executeShadow<T>(
    originalCtx: SolvixContext<T>,
    primaryResponse: SolvixResponse<T>,
    shadowOptions: NonNullable<SolvixContext<T>["options"]["shadow"]>
) {
    try {
        const start = Date.now();

        SolvixBus.emit({
            type: "request:shadowStart",
            context: originalCtx,
            timestamp: start
        });

        // Build secondary URL safely
        const originalUrl = new URL(originalCtx.url);

        const secondaryUrl =
            shadowOptions.secondaryBaseURL +
            originalUrl.pathname +
            originalUrl.search;

        const originalFetch = originalCtx.options.fetch ?? {};

        // Build RequestInit safely (strict mode compatible)
        const shadowInit: RequestInit = {};

        if (originalFetch.method !== undefined) {
            shadowInit.method = originalFetch.method;
        }

        if (originalFetch.body !== undefined) {
            shadowInit.body = originalFetch.body ?? null;
        }

        if (originalFetch.credentials !== undefined) {
            shadowInit.credentials = originalFetch.credentials;
        }

        if (originalFetch.cache !== undefined) {
            shadowInit.cache = originalFetch.cache;
        }

        if (originalFetch.mode !== undefined) {
            shadowInit.mode = originalFetch.mode;
        }

        if (originalFetch.redirect !== undefined) {
            shadowInit.redirect = originalFetch.redirect;
        }

        if (originalFetch.referrer !== undefined) {
            shadowInit.referrer = originalFetch.referrer;
        }

        if (originalFetch.integrity !== undefined) {
            shadowInit.integrity = originalFetch.integrity;
        }

        if (originalFetch.keepalive !== undefined) {
            shadowInit.keepalive = originalFetch.keepalive;
        }

        if (originalFetch.headers !== undefined) {
            shadowInit.headers = originalFetch.headers;
        }

        // DO NOT reuse abort signal
        // DO NOT pass window
        // DO NOT pass internal props

        const secondaryResponse = await fetch(
            secondaryUrl,
            shadowInit
        );

        let secondaryData: any;

        try {
            secondaryData = await secondaryResponse.clone().json();
        } catch {
            secondaryData = await secondaryResponse.text();
        }

        const secondary: SolvixResponse<any> = {
            data: secondaryData,
            status: secondaryResponse.status,
            headers: secondaryResponse.headers,
            meta: {
                startTime: start,
                endTime: Date.now(),
                duration: Date.now() - start,
                attempt: 0,
                retries: 0,
                runtime: originalCtx.meta.runtime
            }
        };

        SolvixBus.emit({
            type: "request:shadowComplete",
            context: originalCtx,
            timestamp: Date.now()
        });

        if (shadowOptions.compareResponse) {
            const isDifferent =
                JSON.stringify(primaryResponse.data) !==
                JSON.stringify(secondary.data);

            if (isDifferent) {
                shadowOptions.onDifference?.(primaryResponse, secondary);

                SolvixBus.emit({
                    type: "request:shadowDifference",
                    context: originalCtx,
                    timestamp: Date.now()
                });
            }
        }

    } catch {
        // Shadow must NEVER throw
        SolvixBus.emit({
            type: "request:shadowError",
            context: originalCtx,
            timestamp: Date.now()
        });
    }
}