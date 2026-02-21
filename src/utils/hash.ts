export async function hashString(
    input: string
): Promise<string> {

    if (typeof crypto !== "undefined" &&
        crypto.subtle) {

        const encoder = new TextEncoder();
        const data = encoder.encode(input);

        const digest = await crypto.subtle.digest(
            "SHA-256",
            data
        );

        return Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }

    // Fallback simple hash (Node older)
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const chr = input.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0;
    }

    return String(hash);
}