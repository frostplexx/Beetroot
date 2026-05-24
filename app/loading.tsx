const SKELETON_COUNT = 30;

export default function Loading() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            <div className="container mx-auto px-4 py-4 flex flex-col h-full">
                <div className="w-full mb-4 flex-shrink-0">
                    <div className="h-4 w-32 rounded bg-white/10" />
                </div>

                <div
                    className="grid w-full gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 flex-1 min-h-0 overflow-hidden content-start"
                    aria-hidden
                >
                    {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                        <div
                            key={i}
                            className="aspect-square w-full rounded-xl bg-white/5 animate-pulse"
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
