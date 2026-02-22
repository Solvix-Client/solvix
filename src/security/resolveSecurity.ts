import type { SolvixSecurityOptions } from "../types";

export function resolveSecurity(
    security?: SolvixSecurityOptions
): Required<SolvixSecurityOptions> {

    const strict = security?.strictMode ?? false;

    return {
        enforceHTTPS: strict || (security?.enforceHTTPS ?? false),
        allowedDomains: security?.allowedDomains ?? [],
        blockInsecureHeaders: strict || (security?.blockInsecureHeaders ?? false),
        maskSensitiveHeaders: strict || (security?.maskSensitiveHeaders ?? false),
        redactSnapshot: strict || (security?.redactSnapshot ?? false),
        strictMode: strict,
        maxBodySize: security?.maxBodySize ?? Infinity,
        maxResponseSize: security?.maxResponseSize ?? Infinity,
        allowedMethods: security?.allowedMethods ?? [],
        preventShadowTokenLeak:
            strict || (security?.preventShadowTokenLeak ?? false)
    };
}