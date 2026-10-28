import { RilldayApplication } from '@repo/frontend';
import { createApplication } from '@repo/frontend/application';
import { createFetchServerTransport } from '@repo/frontend/network/http';
import {
  createBrowserCredentialSession,
  createIndexedDbStorage,
  withWorkspaceLock,
} from '@repo/frontend/storage/indexeddb';
import '@repo/ui/styles/fonts/web.css';
import { PwaUpdates } from '@repo/frontend/updates';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing application root');
}
const demo = new URLSearchParams(location.search).get('demo') === '1';
const application = createApplication({
  transport: createFetchServerTransport(),
  storage: createIndexedDbStorage({ demo }),
  coordination: { withWorkspaceLock },
  credentials: createBrowserCredentialSession(),
  demo,
});
createRoot(root).render(
  <StrictMode>
    <RilldayApplication
      application={application}
      runtime="web"
      version={import.meta.env.VITE_APP_VERSION}
      suggestedServerUrl={demo ? undefined : location.origin}
    >
      {import.meta.env.PROD
        ? (application) => (
            <PwaUpdates
              application={application}
              serviceWorkerUrl={`${import.meta.env.BASE_URL}sw.js`}
            />
          )
        : undefined}
    </RilldayApplication>
  </StrictMode>,
);
