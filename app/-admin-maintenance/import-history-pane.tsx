import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import Heatmap, { type HeatmapData } from "@/components/ui/heatmap";
import { Pane, ErrorBanner } from "./primitives";
import { fmt } from "./utils";

export function ImportHistoryPane() {
    const [data, setData] = useState<HeatmapData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetch("/api/admin/import-heatmap")
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<HeatmapData>;
            })
            .then(setData)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, []);

    useEffect(() => {
        if (!data || !scrollRef.current) return;
        scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }, [data]);

    const endDate = new Date();
    const startDate = (() => {
        const validDates = (data ?? [])
            .map((d) => d.date)
            .filter((s): s is string => typeof s === "string" && s.length > 0)
            .sort();
        if (validDates.length > 0) {
            const earliest = new Date(validDates[0] + "T00:00:00");
            if (!Number.isNaN(earliest.getTime())) return earliest;
        }
        const fallback = new Date();
        fallback.setFullYear(endDate.getFullYear() - 1);
        return fallback;
    })();

    const totalSongs = data?.reduce((s, d) => s + d.value, 0) ?? 0;
    const activeDays = data?.filter((d) => d.value > 0).length ?? 0;

    const summary = data
        ? `${fmt(totalSongs)} song${totalSongs === 1 ? "" : "s"}, ${fmt(activeDays)} active day${activeDays === 1 ? "" : "s"}`
        : undefined;

    return (
        <Pane title="Import history" summary={summary}>
            {error && <ErrorBanner>{error}</ErrorBanner>}

            {!data && !error && (
                <p className="text-xs text-white/45 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading
                </p>
            )}

            {data && (
                <div ref={scrollRef} className="overflow-x-auto">
                    <Heatmap
                        data={data}
                        startDate={startDate}
                        endDate={endDate}
                        colorMode="interpolate"
                        interpolation="sqrt"
                        cellSize={12}
                        gap={3}
                        maxColor="#e84140"
                        minColor="#2a0a0a"
                        valueDisplayFunction={(v) => `${v} song${v === 1 ? "" : "s"}`}
                    />
                </div>
            )}
        </Pane>
    );
}
