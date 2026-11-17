import { modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";

/**
 * Whether new conversations start with tools on: the reader's own setting when they made one,
 * else the choice of the deployment in config.json, else off.
 *
 * @param own - The reader's setting, undefined while they made none
 * @param deployment - The deployment's choice, undefined when config.json makes none
 * @returns true when a conversation without a switch of its own offers tools
 */
export function resolveToolsDefault(own: boolean | undefined, deployment: boolean | undefined) {
    return own ?? deployment ?? false;
}

/**
 * The same, read from the stores at this moment.
 *
 * @returns true when a conversation without a switch of its own offers tools
 */
export function toolsEnabledByDefault(): boolean {
    return resolveToolsDefault(
        settingsStore.getState().settings.tools.enabledByDefault,
        modelsStore.getState().toolsEnabledByDefault,
    );
}
