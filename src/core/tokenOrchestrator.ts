class TokenOrchestrator {

    private refreshing = false;
    private refreshPromise: Promise<string> | null = null;

    async handleRefresh(
        refreshFn: () => Promise<string>
    ): Promise<string> {

        if (this.refreshing && this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshing = true;

        this.refreshPromise = refreshFn()
            .then(token => {
                this.refreshing = false;
                return token;
            })
            .catch(err => {
                this.refreshing = false;
                throw err;
            });

        return this.refreshPromise;
    }
}

export const tokenOrchestrator = new TokenOrchestrator();