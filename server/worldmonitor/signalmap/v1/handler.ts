import type { SignalMapServiceHandler } from '../../../../src/generated/server/worldmonitor/signalmap/v1/service_server';

import { listSignalMapEvents } from './list-signals';

export const signalMapHandler: SignalMapServiceHandler = {
  listSignalMapEvents,
};
