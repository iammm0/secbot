export { MysqlProbeTool } from './mysql-probe.tool';
export { RedisProbeTool } from './redis-probe.tool';
export { SmbEnumTool } from './smb-enum.tool';
export { SnmpQueryTool } from './snmp-query.tool';

import { BaseTool } from '../core/base-tool';
import { MysqlProbeTool } from './mysql-probe.tool';
import { RedisProbeTool } from './redis-probe.tool';
import { SmbEnumTool } from './smb-enum.tool';
import { SnmpQueryTool } from './snmp-query.tool';

export const PROTOCOL_TOOLS: BaseTool[] = [
  new MysqlProbeTool(),
  new RedisProbeTool(),
  new SmbEnumTool(),
  new SnmpQueryTool(),
];
