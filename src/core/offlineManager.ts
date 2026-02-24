import { offlineQueue } from "../store/offlineQueue";

export function setupOfflineListener() {
    if (typeof window === "undefined") return;

    window.addEventListener("online", async () => {
        await offlineQueue.flush();
    });
}