export interface SolvixErrorOptions {
    message: string;
    status?: number;
    cause?: unknown;
    isNetworkError?: boolean;
    isTimeout?: boolean;
    isRetryable?: boolean;
    attempts?: number;
}

export class SolvixError extends Error {
    status: number | undefined;
    override cause: unknown | undefined;
    isNetworkError: boolean | undefined;
    isTimeout: boolean | undefined;
    isRetryable: boolean | undefined;
    attempts: number | undefined;

    constructor(options: SolvixErrorOptions) {
        super(options.message);

        // Ensure proper prototype chain for Error subclassing
        Object.setPrototypeOf(this, SolvixError.prototype);

        this.name = "SolvixError";
        this.status = options.status;
        this.cause = options.cause;
        this.isNetworkError = options.isNetworkError;
        this.isTimeout = options.isTimeout;
        this.isRetryable = options.isRetryable;
        this.attempts = options.attempts;
    }
}