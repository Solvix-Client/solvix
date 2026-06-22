import { canonicalizeUrl } from "./canonicalize";
import { hashString } from "./hash";
import type {
    FingerprintOptions,
    CanonicalRequest
} from "../types";

export async function generateFingerprint(
    method: string,
    url: string,
    fetchOptions?: RequestInit,
    options?: FingerprintOptions,
    /** When true, skip the SHA-256 hash and return a lightweight key. */
    skipHash?: boolean
): Promise<string> {

    const canonicalUrl = canonicalizeUrl(url);

    const canonical: CanonicalRequest = {
        method: method.toUpperCase(),
        url: canonicalUrl
    };

    if (options?.includeHeaders &&
        fetchOptions?.headers) {

        const headers: Record<string, string> = {};

        const headerKeys = options.headerKeys;

        new Headers(fetchOptions.headers)
            .forEach((value, key) => {

                if (
                    !headerKeys ||
                    headerKeys.includes(key)
                ) {
                    headers[key.toLowerCase()] = value;
                }
            });

        canonical.headers = headers;
    }

    if (options?.includeBody &&
        fetchOptions?.body) {

        const bodyString =
            typeof fetchOptions.body === "string"
                ? fetchOptions.body
                : JSON.stringify(fetchOptions.body);

        canonical.bodyHash =
            await hashString(bodyString);
    }

    if (options?.customStrategy) {
        return options.customStrategy(canonical);
    }

    // Fast path: skip expensive SHA-256 when no storage feature needs it
    if (skipHash) {
        return canonicalUrl;
    }

    return await hashString(
        JSON.stringify(canonical)
    );
}