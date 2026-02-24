export async function handleStream(
    response: Response,
    options: {
        sse?: boolean;
        parseJsonLines?: boolean;
    }
) {

    if (!response.body) {
        throw new Error("Streaming not supported in this runtime");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    async function* iterator() {
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            if (options.sse) {
                const events = buffer.split("\n\n");
                buffer = events.pop() ?? "";

                for (const event of events) {
                    const lines = event.split("\n");
                    const dataLines = lines
                        .filter(line => line.startsWith("data:"))
                        .map(line => line.replace("data:", "").trim());

                    yield {
                        raw: event,
                        data: dataLines.join("\n")
                    };
                }

            } else if (options.parseJsonLines) {
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        yield JSON.parse(line);
                    } catch {
                        yield line;
                    }
                }

            } else {
                yield decoder.decode(value);
            }
        }

        if (buffer.trim()) {
            yield buffer;
        }
    }

    return iterator();
}