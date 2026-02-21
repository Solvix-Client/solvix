export function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);

        if (signal) {
            signal.addEventListener("abort", () => {
                clearTimeout(timeout);
                reject(new Error("Sleep aborted"));
            });
        }
    });
}