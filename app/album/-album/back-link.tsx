import { ChevronLeft } from "lucide-react";
import { Link, useRouter } from "@tanstack/react-router";
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
        "inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-white/[0.08] border border-white/10 backdrop-blur-md text-sm text-white/90 hover:bg-white/[0.14] hover:border-white/20 hover:text-white transition-all duration-200 active:scale-[0.97] group";

    if (canGoBack) {
        return (
            <button
                type="button"
                onClick={() => router.history.back()}
                className={className}
            >
                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                Back
            </button>
        );
    }

    return (
        <Link to="/" className={className}>
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back
        </Link>
    );
}
