export { CloudMetadataDetectTool } from './cloud-metadata-detect.tool';
export { S3BucketEnumTool } from './s3-bucket-enum.tool';
export { ContainerInfoTool } from './container-info.tool';
export { CloudBucketEnumTool } from './cloud-bucket-enum.tool';

import { BaseTool } from '../core/base-tool';
import { CloudMetadataDetectTool } from './cloud-metadata-detect.tool';
import { S3BucketEnumTool } from './s3-bucket-enum.tool';
import { ContainerInfoTool } from './container-info.tool';
import { CloudBucketEnumTool } from './cloud-bucket-enum.tool';

export const CLOUD_TOOLS: BaseTool[] = [
  new CloudMetadataDetectTool(),
  new S3BucketEnumTool(),
  new ContainerInfoTool(),
  new CloudBucketEnumTool(),
];
