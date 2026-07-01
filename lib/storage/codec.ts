import { compressToUTF16, decompressFromUTF16 } from "lz-string";

import type { Codec } from "@/lib/storage/adapter";

/**
 * One-character prefix marking a stored value as lz-string compressed.
 * Every value written by encode() carries it.
 */
export const COMPRESSED_SENTINEL = "\u0001";

/**
 * Codec compressing conversation payloads with lz-string UTF-16 mode, which
 * is safe to store in localStorage (UTF-16 backed) and roughly halves usage.
 */
export const lzCodec: Codec = {
    /**
     * Compress a plain string and tag it with the sentinel prefix.
     *
     * @param value - Plain string to compress
     */
    encode(value: string): string {
        if (value === "") {
            return COMPRESSED_SENTINEL;
        }
        return COMPRESSED_SENTINEL + compressToUTF16(value);
    },

    /**
     * Restore a stored string, decompressing the sentinel-prefixed payload.
     *
     * @param value - Stored string written by encode()
     */
    decode(value: string): string {
        if (!value.startsWith(COMPRESSED_SENTINEL)) {
            throw new Error(
                "Failed to decode stored value: missing compression sentinel " +
                    "(value was not written by this codec).",
            );
        }
        const compressed = value.slice(COMPRESSED_SENTINEL.length);
        if (compressed === "") {
            // Bare sentinel is how encode stores the empty string.
            return "";
        }
        const decompressed = decompressFromUTF16(compressed);
        if (decompressed === null || decompressed === "") {
            throw new Error(
                "Failed to decompress stored value: corrupted lz-string payload " +
                    "(decompression returned nothing for a non-empty input).",
            );
        }
        return decompressed;
    },
};

/**
 * Pass-through codec used for small keys (index, settings) where
 * compression overhead is not worth it.
 */
export const identityCodec: Codec = {
    /**
     * Return the value unchanged.
     *
     * @param value - Plain string
     */
    encode(value: string): string {
        return value;
    },

    /**
     * Return the value unchanged.
     *
     * @param value - Stored string
     */
    decode(value: string): string {
        return value;
    },
};
