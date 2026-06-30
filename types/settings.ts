// Supported UI skins. Single source of truth, reused by the pre-paint boot script.
export const SKIN_IDS = ["flat", "soft", "contrast", "warm", "forest", "dim"] as const;
export type SkinId = (typeof SKIN_IDS)[number];

/**
 * Supported UI locales with their native labels. Single source of truth, reused
 * by the language switchers and the mount-time locale detection. Order is the
 * display order; the first entry is the fallback locale.
 */
export const LOCALES = [
    { id: "fr", label: "Français" },
    { id: "en", label: "English" },
] as const;
export type Locale = (typeof LOCALES)[number]["id"];

// Width of the single-chat column and composer on large screens.
export type ChatWidth = "medium" | "large" | "xlarge";

/**
 * Max-width utility per chat-width preference; "medium" matches the historical
 * hardcoded width. Full class strings so Tailwind keeps them in the build.
 */
export const CHAT_WIDTH_CLASS: Record<ChatWidth, string> = {
    medium: "max-w-3xl",
    large: "max-w-4xl",
    xlarge: "max-w-5xl",
};

/**
 * Sampling parameters. Undefined means "use the server default" and the
 * parameter is then omitted from request bodies entirely.
 */
export interface SamplingSettings {
    temperature?: number;
    topK?: number;
    topP?: number;
    minP?: number;
    maxTokens?: number;
}

/**
 * Repetition penalties; dry* parameters are llama.cpp only.
 *
 * @param repeatPenalty - Penalty applied to already-seen tokens
 * @param presencePenalty - Flat penalty for tokens present in the context
 * @param frequencyPenalty - Penalty scaled by how often a token appeared
 * @param dryMultiplier - DRY penalty strength (llama.cpp only)
 * @param dryBase - DRY exponential base for repeated sequences (llama.cpp only)
 * @param dryAllowedLength - Sequence length allowed before DRY kicks in (llama.cpp only)
 * @param dryPenaltyLastN - How many recent tokens DRY scans (llama.cpp only)
 */
export interface PenaltySettings {
    repeatPenalty?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    dryMultiplier?: number;
    dryBase?: number;
    dryAllowedLength?: number;
    dryPenaltyLastN?: number;
}

/**
 * Purely visual preferences.
 *
 * @param showStats - Show the generation stats footer on messages
 * @param expandReasoningByDefault - Expand the reasoning section on new messages
 * @param expandSearchByDefault - Expand the search/sub-queries section on new messages
 * @param expandSourcesByDefault - Expand the RAG sources section on new messages
 * @param chatWidth - Column and composer width on large screens
 * @param compactInput - Use the compact composer layout
 */
export interface DisplaySettings {
    showStats: boolean;
    expandReasoningByDefault: boolean;
    expandSearchByDefault: boolean;
    expandSourcesByDefault: boolean;
    chatWidth: ChatWidth;
    compactInput: boolean;
}

// How partial chapter analyses are combined into the final answer.
export type ChunkingStrategy = "mapreduce" | "rolling";

/**
 * Over-context chunking: when an input (typed prompt plus text/PDF attachments)
 * exceeds the model context window, it is split into chapters analyzed one by
 * one, then synthesized into a final answer.
 */
export interface ChunkingSettings {
    enabled: boolean;
    strategy: ChunkingStrategy;
    fallbackContextTokens: number;
    safetyFraction: number;
}

/**
 * Conversation compaction: when the accumulated branch approaches the model
 * context window, the older messages are summarized client-side and sent in
 * their place, so long conversations stay within n_ctx without losing the
 * recent exchanges. Complements chunking, which handles a single oversized input.
 */
export interface CompactionSettings {
    enabled: boolean;
    thresholdFraction: number;
    keepRecentTurns: number;
}

/**
 * All persisted user settings.
 *
 * @param systemPrompt - Default system prompt sent with each conversation
 * @param sendOnEnter - Whether Enter sends the message (vs. inserting a newline)
 * @param sendOnEnterHint - Whether to show the send-on-Enter hint in the composer
 * @param thinking - Whether reasoning/thinking mode is enabled
 * @param effort - Reasoning effort level passed to the model
 * @param skin - Selected UI skin
 * @param sampling - Sampling parameters
 * @param penalties - Repetition penalty parameters
 * @param display - Purely visual preferences
 * @param chunking - Over-context chunking settings
 * @param compaction - Conversation compaction settings
 * @param imageMaxDimension - Max pixel dimension images are downscaled to
 * @param pdfAsImage - Whether PDFs are sent as page images instead of extracted text
 */
export interface AppSettings {
    systemPrompt: string;
    sendOnEnter: boolean;
    sendOnEnterHint: boolean;
    thinking: boolean;
    effort: string;
    skin: SkinId;
    sampling: SamplingSettings;
    penalties: PenaltySettings;
    display: DisplaySettings;
    chunking: ChunkingSettings;
    compaction: CompactionSettings;
    imageMaxDimension: number;
    pdfAsImage: boolean;
}

// Default settings for a fresh install.
export const DEFAULT_SETTINGS: AppSettings = {
    systemPrompt: "",
    sendOnEnter: true,
    sendOnEnterHint: true,
    thinking: true,
    effort: "",
    skin: "soft",
    sampling: {},
    penalties: {},
    display: {
        showStats: true,
        expandReasoningByDefault: false,
        expandSearchByDefault: false,
        expandSourcesByDefault: false,
        chatWidth: "medium",
        compactInput: false,
    },
    chunking: {
        enabled: true,
        strategy: "mapreduce",
        fallbackContextTokens: 65536,
        safetyFraction: 0.8,
    },
    compaction: {
        enabled: true,
        thresholdFraction: 0.8,
        keepRecentTurns: 2,
    },
    imageMaxDimension: 1024,
    pdfAsImage: false,
};
