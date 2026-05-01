import { createLogger } from '../_shared/logger.ts';

const log = createLogger('api');

export interface BootInfo {
  port: number;
  pid: number;
  node: string;
}

export function emitApiStarted(info: BootInfo): void {
  log.info('api:started', {
    port: info.port,
    pid: info.pid,
    node: info.node,
  });
}
