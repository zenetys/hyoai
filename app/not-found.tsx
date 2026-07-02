"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirect to the home page when a non-existent route is visited. This is a
 * client-side redirect because Next.js does not support a server-side redirect
 * for the 404 page.
 *
 * @returns Null
 */
export default function NotFound() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/");
    }, [router]);

    return null;
}
