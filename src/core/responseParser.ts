import type { SerializationOptions } from "../types";

export async function parseResponse(
    response: Response,
    responseType: string | undefined,
    transform?: (response: Response) => Promise<any>,
    serialization?: { protobuf?: SerializationOptions; msgpack?: SerializationOptions }
) {

    if (transform) {
        return transform(response);
    }

    if (!responseType || responseType === "json") {
        return response.json();
    }

    if (responseType === "text") {
        return response.text();
    }

    if (responseType === "blob") {
        return response.blob();
    }

    if (responseType === "arrayBuffer") {
        return response.arrayBuffer();
    }

    if (responseType === "formData") {
        return response.formData();
    }

    if (responseType === "raw") {
        return response;
    }

    if (responseType === "stream") {
        return response.body;
    }

    if (responseType === "protobuf") {
        const codec = serialization?.protobuf;
        if (!codec) {
            throw new Error(
                "responseType \"protobuf\" requires a serialization.protobuf decoder"
            );
        }
        const buffer = await response.arrayBuffer();
        return codec.decoder(new Uint8Array(buffer));
    }

    if (responseType === "msgpack") {
        const codec = serialization?.msgpack;
        if (!codec) {
            throw new Error(
                "responseType \"msgpack\" requires a serialization.msgpack decoder"
            );
        }
        const buffer = await response.arrayBuffer();
        return codec.decoder(new Uint8Array(buffer));
    }

    return response.json();
}