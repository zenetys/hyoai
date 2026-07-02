import type { useTranslations } from "next-intl";

import type { MessageNode } from "@/types/chat";

/**
 * Pick the translated error text for a failed generation, keyed by its error
 * kind. Shared by the normal assistant row and the chapter row so both render a
 * failed generation identically.
 *
 * @param t - chat namespace translator
 * @param node - Failed node carrying error/errorKind
 */
export function errorText(
    t: ReturnType<typeof useTranslations<"chat">>,
    node: MessageNode,
): string {
    switch (node.errorKind) {
        case "network":
            return t("errorNetwork");
        case "auth":
            return t("errorAuth");
        case "stream":
            return t("errorStream", { message: node.error ?? "" });
        default:
            return t("errorHttp", { message: node.error ?? "" });
    }
}
