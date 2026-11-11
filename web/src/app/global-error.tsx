'use client';

/**
 * The last resort: an error in the root layout itself (or one the (app) boundary could
 * not hold). Next renders this in place of the root layout, so it draws its own document
 * and brings the global stylesheet with it; the theme boot script does not run here, so
 * the page is the default dark ground.
 */

import { ErrorScreen } from '@/components/shell/ErrorScreen';
import './globals.css';

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Error · bb2dash</title>
        <ErrorScreen error={error} retry={retry} fullPage />
      </body>
    </html>
  );
}
