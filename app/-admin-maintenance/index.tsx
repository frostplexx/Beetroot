import { ReconcilePane } from "./reconcile-pane";
import { TrashPane } from "./trash-pane";
import { ImportHistoryPane } from "./import-history-pane";
import { ToolsPane } from "./tools-pane";

export default function Maintenance() {
    return (
        <div className="container mx-auto px-4 md:px-6 pt-2 pb-16 max-w-6xl">
            <div className="grid grid-cols-1 gap-3">
                <ReconcilePane />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <TrashPane />
                    <ImportHistoryPane />
                </div>
                <ToolsPane />
            </div>
        </div>
    );
}
