import type { SerializationOptions } from "../types";

/**
 * Create a protobuf codec from user-provided encode/decode functions.
 *
 * @example
 * ```ts
 * import { createProtobufCodec } from "@solvix/client";
 * import { MyMessage } from "./generated/proto";
 *
 * const codec = createProtobufCodec({
 *   encode: (data) => MyMessage.encode(MyMessage.fromObject(data)).finish(),
 *   decode: (buf) => MyMessage.decode(new Uint8Array(buf)),
 * });
 *
 * const client = createClient({ serialization: { protobuf: codec } });
 * ```
 */
export function createProtobufCodec(
    opts: Pick<SerializationOptions, "encoder" | "decoder"> & { contentType?: string }
): SerializationOptions {
    return {
        encoder: opts.encoder,
        decoder: opts.decoder,
        contentType: opts.contentType ?? "application/protobuf",
    };
}
