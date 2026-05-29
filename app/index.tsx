import { createFileRoute } from "@tanstack/react-router";
import Library from "./-library";

export const Route = createFileRoute("/")({
    component: HomePage,
});

function HomePage() {
    return <Library />;
}
