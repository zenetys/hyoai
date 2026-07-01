import { ApiError, type ApiErrorKind } from "@/types/api";

/**
 * Map an error thrown by fetch or by a stream read into a typed ApiError.
 * AbortError becomes "aborted" and TypeError becomes "network" (the UI turns
 * network failures into a CORS hint); anything else uses the fallback kind.
 *
 * @param err - Value caught from fetch or reader.read()
 * @param fallbackKind - Kind used when the error matches no known shape
 * @returns ApiError ready to be thrown or yielded
 */
export function mapThrownError(err: unknown, fallbackKind: ApiErrorKind): ApiError {
    if (err instanceof ApiError) {
        return err;
    }
    if (err instanceof Error && err.name === "AbortError") {
        return new ApiError("aborted", "aborted");
    }
    if (err instanceof TypeError) {
        return new ApiError("network", err.message);
    }
    return new ApiError(fallbackKind, err instanceof Error ? err.message : String(err));
}

/**
 * Build an ApiError from a non-ok HTTP response.
 * Tries to extract error.message from the JSON body and maps 401/403 to the
 * "auth" kind so the UI can suggest checking the API key.
 *
 * @param response - Fetch response with a non-ok status
 * @returns ApiError describing the HTTP failure
 */
export async function errorFromResponse(response: Response): Promise<ApiError> {
    let message = `HTTP ${response.status}`;
    try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (typeof body?.error?.message === "string" && body.error.message !== "") {
            message = body.error.message;
        }
    } catch {
        // body was not JSON; keep the generic status message
    }
    const kind: ApiErrorKind = response.status === 401 || response.status === 403 ? "auth" : "http";
    return new ApiError(kind, message, response.status);
}
