export function resolveUrl(
    url: string,
    baseURL?: string
): string {

    if (!baseURL) return url;

    // If absolute URL → ignore baseURL
    try {
        new URL(url);
        return url;
    } catch {
        // Not absolute → continue
    }

    const normalizedBase = baseURL.endsWith("/")
        ? baseURL.slice(0, -1)
        : baseURL;

    const normalizedPath = url.startsWith("/")
        ? url
        : `/${url}`;

    return `${normalizedBase}${normalizedPath}`;
}