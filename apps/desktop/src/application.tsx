import type { Root } from 'react-dom/client';
import { type HostLifecycleProps, RilldayApplication } from '@repo/frontend';
import { createApplication } from '@repo/frontend/application';
import { createFetchServerTransport } from '@repo/frontend/network/http';
import { createIndexedDbStorage, withWorkspaceLock } from '@repo/frontend/storage/indexeddb';
import { StrictMode } from 'react';
import { desktopCredentials } from './credentials';
import { desktopDataDirectory } from './data-directory';
import { useDesktopCloseGuard } from './use-desktop-close-guard';

function DesktopLifecycle({ application, reportError }: HostLifecycleProps) {
  useDesktopCloseGuard(application, reportError);
  return null;
}

export function mountApplication(root: Root) {
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const application = createApplication({
    transport: createFetchServerTransport(),
    storage: createIndexedDbStorage({ demo }),
    coordination: { withWorkspaceLock },
    credentials: desktopCredentials,
    demo,
  });
  root.render(
    <StrictMode>
      <RilldayApplication
        application={application}
        runtime="desktop"
        version={import.meta.env.VITE_APP_VERSION}
        Lifecycle={DesktopLifecycle}
        dataDirectory={desktopDataDirectory(application)}
      />
    </StrictMode>,
  );
}
