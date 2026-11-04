import type { useTranslations } from "next-intl";

import type { MessageNode } from "@/types/chat";

// Wording of a server refusing tools (llama.cpp without --jinja, vLLM without auto tool choice).
const TOOLS_REJECTED = /jinja|tool[_ ]?(call|choice|s)\b|auto tool choice/i;

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
        case "timeout":
            return t("errorTimeout");
        case "auth":
            return t("errorAuth");
        case "stream":
            return t("errorStream", { message: node.error ?? "" });
        case "http":
            return TOOLS_REJECTED.test(node.error ?? "")
                ? t("errorToolsRejected", { message: node.error ?? "" })
                : t("errorHttp", { message: node.error ?? "" });
        default:
            return t("errorHttp", { message: node.error ?? "" });
    }
}
