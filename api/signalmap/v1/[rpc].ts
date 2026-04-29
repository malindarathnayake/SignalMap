export const config = { runtime: 'edge' };

import { createDomainGateway, serverOptions } from '../../../server/gateway';
import { createSignalMapServiceRoutes } from '../../../src/generated/server/worldmonitor/signalmap/v1/service_server';
import { signalMapHandler } from '../../../server/worldmonitor/signalmap/v1/handler';

export default createDomainGateway(
  createSignalMapServiceRoutes(signalMapHandler, serverOptions),
);
