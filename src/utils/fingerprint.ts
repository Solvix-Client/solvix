export function generateFingerprint(
    url: string,
    fetchOptions?: RequestInit
) {
    const method = fetchOptions?.method ?? "GET";

    const body =
        typeof fetchOptions?.body === "string"
            ? fetchOptions.body
            : JSON.stringify(fetchOptions?.body ?? "");

    return `${method}:${url}:${body}`;
}