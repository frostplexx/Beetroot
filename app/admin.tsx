import { createFileRoute } from "@tanstack/react-router";
import Maintenance from "./-admin-maintenance/index";

export const Route = createFileRoute("/admin")({
    head: () => ({
        meta: [{ title: "Maintenance · Beetroot" }],
    }),
    component: Maintenance,
});
