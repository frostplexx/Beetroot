export function relTime(ts: number | null | undefined): string {
    if (!ts) return "never";
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    const min = Math.round(diff / 60_000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    return `${day}d ago`;
}

export function fmt(n: number | null | undefined): string {
    return (n ?? 0).toLocaleString();
}
