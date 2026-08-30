import {cookies} from 'next/headers';
import operationSnapshotModule from '../../lib/navigation/operation-snapshot.js';
import Phase28Shell from './phase28-shell.js';

export default async function Phase28RouteShell({routeId,children}) {
  const cookieStore=await cookies();
  const navigationSnapshot=operationSnapshotModule.parseNavigationOperationSnapshotCookie(
    cookieStore.get(operationSnapshotModule.NAVIGATION_SNAPSHOT_COOKIE)?.value
  );
  return <Phase28Shell
    routeId={routeId}
    navigationSnapshot={navigationSnapshot}
    generatedAt={navigationSnapshot?.generatedAt||null}
  >{children}</Phase28Shell>;
}
