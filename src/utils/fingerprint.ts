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
    options?: FingerprintOptions
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

    return await hashString(
        JSON.stringify(canonical)
    );
}