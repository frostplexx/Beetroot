import * as React from "react";

// The app is dark-only (the original next-themes config was
// defaultTheme="dark" + enableSystem={false}). We keep a tiny provider
// purely for parity at the call site — the `dark` class is added directly
// on <html> in the root route.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
