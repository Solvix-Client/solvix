export function buildQueryString(
    baseUrl: string,
    params?: Record<string, any>
): string {
    if (!params || Object.keys(params).length === 0) {
        return baseUrl;
    }

    const url = new URL(baseUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        if (Array.isArray(value)) {
            value.forEach(v => {
                url.searchParams.append(key, String(v));
            });
        } else {
            url.searchParams.append(key, String(value));
        }
    });

    return url.toString();
}