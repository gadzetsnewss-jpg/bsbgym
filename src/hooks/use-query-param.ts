"use client";

import * as React from "react";

/**
 * Reads a query parameter on the client after mount. Avoids relying on
 * `useSearchParams` (which requires a Suspense boundary in statically
 * prerendered pages) - the auth pages only need these values in the browser.
 */
export function useQueryParam(name: string): string | null {
  const [value, setValue] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setValue(params.get(name));
  }, [name]);

  return value;
}
