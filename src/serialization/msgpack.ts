import type { SerializationOptions } from "../types";

/**
 * Create a MessagePack codec from user-provided encode/decode functions.
 *
 * @example
 * ```ts
 * import { encode, decode } from "@msgpack/msgpack";
 * import { createMsgpackCodec } from "@solvix/client";
 *
 * const codec = createMsgpackCodec({
 *   encode: (data) => encode(data) as Uint8Array,
 *   decode: (buf) => decode(new Uint8Array(buf)),
 * });
 *
 * const client = createClient({ serialization: { msgpack: codec } });
 * ```
 */
export function createMsgpackCodec(
    opts: Pick<SerializationOptions, "encoder" | "decoder"> & { contentType?: string }
): SerializationOptions {
    return {
        encoder: opts.encoder,
        decoder: opts.decoder,
        contentType: opts.contentType ?? "application/msgpack",
    };
}
