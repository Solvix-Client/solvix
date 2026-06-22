import type { CookieJarOptions } from "../types";

interface StoredCookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    createdAt: number;
}

/**
 * Simple in-memory cookie jar for environments without native cookie storage (Node.js, edge).
 * Stores Set-Cookie headers from responses and attaches matching cookies to subsequent requests.
 */
export class CookieJar {
    private cookies = new Map<string, StoredCookie>();
    private options: CookieJarOptions;

    constructor(options: CookieJarOptions = {}) {
        this.options = options;
    }

    /**
     * Parses Set-Cookie headers from a Response and stores matching cookies.
     */
    setFromResponse(response: Response): void {
        // Headers.get('set-cookie') returns the first; getAll doesn't exist in all envs.
        // Headers.forEach iterates all. Use a manual approach:
        const cookieHeader = response.headers.get("set-cookie");
        if (!cookieHeader) return;

        // Parse the first cookie name=value pair before any attributes
        const cookies = cookieHeader.split(",").map((s) => s.trim());
        for (const part of cookies) {
            const parsed = parseSetCookie(part);
            if (parsed) {
                this.cookies.set(parsed.name, parsed);
            }
        }
    }

    /**
     * Returns Cookie headers to attach to a request for the given URL.
     */
    getRequestHeaders(_url: string): Record<string, string> {
        if (this.cookies.size === 0) return {};

        const entries: string[] = [];
        for (const [, cookie] of this.cookies) {
            // Apply domain filter if configured
            if (this.options.domain && cookie.domain && cookie.domain !== this.options.domain) {
                continue;
            }
            entries.push(`${cookie.name}=${cookie.value}`);
        }

        return entries.length > 0 ? { Cookie: entries.join("; ") } : {};
    }

    /**
     * Clears all stored cookies.
     */
    clear(): void {
        this.cookies.clear();
    }
}

function parseSetCookie(part: string): StoredCookie | null {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) return null;

    const name = part.slice(0, eqIdx).trim();
    if (!name) return null;

    // Value ends at the first semicolon (attribute separator)
    const rest = part.slice(eqIdx + 1);
    const semiIdx = rest.indexOf(";");
    const value = semiIdx === -1 ? rest.trim() : rest.slice(0, semiIdx).trim();

    return {
        name,
        value,
        createdAt: Date.now()
    };
}
