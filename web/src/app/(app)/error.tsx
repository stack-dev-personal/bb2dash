'use client';

/**
 * Every screen in the (app) group: a render error shows the error screen inside the
 * shell (the top bar and the rail stay up, since `error.tsx` does not wrap its own
 * segment's layout), in place of Next's bare "This page couldn't load".
 */

import { ErrorScreen } from '@/components/shell/ErrorScreen';

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
