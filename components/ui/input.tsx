import * as React from "react";

import { cn } from "@/lib/utils";

// Keeps password managers (browser, 1Password, LastPass, Bitwarden, Dashlane) off ordinary fields
const PLAIN_ATTRIBUTES = {
    autoComplete: "off",
    "data-1p-ignore": true,
    "data-lpignore": "true",
    "data-bwignore": "true",
    "data-form-type": "other",
} as const;

// A credential must not be filled with a saved password, but managers may still offer to store it
const CREDENTIAL_ATTRIBUTES = { autoComplete: "new-password" } as const;

/**
 * Text field. Password managers are told to ignore it, so a setting such as "Max tokens" gets no
 * fill icon; a caller can still override any of these attributes.
 *
 * @param className - Extra classes of the field
 * @param type - Type of the input; "password" is always treated as a credential
 * @param credential - The field holds a secret (a token, an API key), even when it is shown as text
 */
function Input({
    className,
    type,
    credential = false,
    ...props
}: React.ComponentProps<"input"> & { credential?: boolean }) {
    return (
        <input
            type={type}
            data-slot="input"
            {...(credential || type === "password" ? CREDENTIAL_ATTRIBUTES : PLAIN_ATTRIBUTES)}
            className={cn(
                "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
                className,
            )}
            {...props}
        />
    );
}

export { Input };
