import { RilldayApplication } from '@repo/frontend';
import { DemoMenu, DemoResetDialog, createDemoApplication } from '@repo/frontend/demo';
import { createIndexedDbStorage, withWorkspaceLock } from '@repo/frontend/storage/indexeddb';
import '@repo/ui/styles/fonts/web.css';
import { PwaUpdates } from '@repo/frontend/updates';
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing application root');
}
const application = createDemoApplication({
  storage: createIndexedDbStorage({ demo: true, localOnly: true }),
  coordination: { withWorkspaceLock },
});

function DemoApplication() {
  const [resetOpen, setResetOpen] = useState(false);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  return (
    <RilldayApplication
      application={application}
      runtime="web"
      version={import.meta.env.VITE_APP_VERSION}
      navigationFooter={
        <DemoMenu onReset={() => setResetOpen(true)} triggerRef={resetTriggerRef} />
      }
    >
      {() => (
        <>
          {import.meta.env.PROD && (
            <PwaUpdates
              application={application}
              serviceWorkerUrl={`${import.meta.env.BASE_URL}sw.js`}
            />
          )}
          {resetOpen && (
            <DemoResetDialog
              onReset={() => application.resetSampleData()}
              onClose={() => setResetOpen(false)}
              triggerRef={resetTriggerRef}
            />
          )}
        </>
      )}
    </RilldayApplication>
  );
}

createRoot(root).render(
  <StrictMode>
    <DemoApplication />
  </StrictMode>,
);
