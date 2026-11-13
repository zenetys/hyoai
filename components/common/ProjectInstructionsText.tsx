/**
 * Read-only body of the project instructions, shared by the composer dialog and the
 * header popover. Line breaks of the instructions are kept and long words wrap.
 *
 * @param instructions - The instructions of the project
 */
export function ProjectInstructionsText({ instructions }: { instructions: string }) {
    return <p className="text-sm break-words whitespace-pre-wrap">{instructions.trim()}</p>;
}
