export async function buildRequestBody(
    body: unknown,
    bodyType: string | undefined,
    headers: Headers,
    transform?: (body: unknown, headers: Headers) => any,
    avoidPreflight?: boolean
) {

    if (avoidPreflight) {
        const method = headers.get("X-HTTP-Method-Override");

        if (
            headers.has("Content-Type") &&
            headers.get("Content-Type") !==
            "application/x-www-form-urlencoded"
        ) {
            throw new Error(
                "avoidPreflight enabled but content-type may trigger preflight"
            );
        }
    }

    if (transform) {
        return transform(body, headers);
    }

    if (!bodyType || bodyType === "json") {
        headers.set("Content-Type", "application/json");
        return JSON.stringify(body);
    }

    if (bodyType === "form") {
        headers.set(
            "Content-Type",
            "application/x-www-form-urlencoded"
        );

        const params = new URLSearchParams();

        Object.entries(body as Record<string, any>)
            .forEach(([key, value]) => {
                params.append(key, String(value));
            });

        return params;
    }

    if (bodyType === "multipart") {
        const formData = new FormData();

        Object.entries(body as Record<string, any>)
            .forEach(([key, value]) => {
                formData.append(key, value as any);
            });

        // DO NOT set Content-Type (browser sets boundary)
        return formData;
    }

    if (bodyType === "text") {
        headers.set("Content-Type", "text/plain");
        return String(body);
    }

    if (bodyType === "blob") {
        return body;
    }

    if (bodyType === "arrayBuffer") {
        return body;
    }

    return body;
}