import { SolvixError } from "../errors";

export async function safeParseResponse(
    response: Response,
    parseJson: boolean | undefined
) {

    if (parseJson === false) {
        return response.text();
    }

    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
        try {
            return await response.json();
        } catch (err) {
            throw new SolvixError({
                message: "Invalid JSON response",
                cause: err,
                isRetryable: false
            });
        }
    }

    return response.text();
}