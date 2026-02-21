export function canonicalizeUrl(url: string): string {
    const parsed = new URL(url);

    // Sort query params
    const sortedParams = new URLSearchParams(
        parsed.searchParams
    );

    const entries = Array.from(sortedParams.entries())
        .sort(([a], [b]) =>
            a.localeCompare(b)
        );

    parsed.search = new URLSearchParams(entries).toString();

    return parsed.toString();
}