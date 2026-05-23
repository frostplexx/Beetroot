import { Suspense } from "react";
import Library from "./library";

export default async function Home() {

    return (
        <Suspense>
            <Library/>
        </Suspense>
    )
}
