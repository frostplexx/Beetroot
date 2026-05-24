"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Prefer browser history (preserves ?page=N on the library) but fall back
// to a hard "/" link when the user landed here via a deep link.
export function BackLink() {
    const router = useRouter();
    const [canGoBack, setCanGoBack] = useState(false);

    useEffect(() => {
        setCanGoBack(typeof window !== "undefined" && window.history.length > 1);
    }, []);

    const className =
        "inline-flex items-center gap-1.5 py-2 px-3 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm text-sm text-white hover:bg-white/20 hover:border-white/30 hover:scale-105 transition-all group";

    if (canGoBack) {
        return (
            <button
                type="button"
                onClick={() => router.back()}
                className={className}
            >
                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                Back
            </button>
        );
    }

    return (
        <Link href="/" transitionTypes={["nav-back"]} className={className}>
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back
        </Link>
    );
}
