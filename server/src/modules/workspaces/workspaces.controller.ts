import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AddWorkspaceNodeDto,
  BindWorkspaceSessionDto,
  CreateWorkspaceDto,
  RenameWorkspaceDto,
} from './dto/workspaces.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('api/workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list() {
    return { workspaces: this.workspaces.list() };
  }

  @Post()
  create(@Body() body: CreateWorkspaceDto) {
    return this.workspaces.create(body.name);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() body: RenameWorkspaceDto) {
    return this.workspaces.rename(id, body.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workspaces.remove(id);
  }

  @Post(':id/nodes')
  addNode(@Param('id') id: string, @Body() body: AddWorkspaceNodeDto) {
    return this.workspaces.addNode(id, body);
  }

  @Post(':id/nodes/:nodeId/connect')
  connectNode(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.workspaces.connectNode(id, nodeId);
  }

  @Post(':id/nodes/:nodeId/probe')
  async probeNode(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    const node = await this.workspaces.probeNode(id, nodeId);
    return this.workspaces.getNodeSurface(id, node.id);
  }

  @Get(':id/nodes/:nodeId/surface')
  getNodeSurface(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.workspaces.getNodeSurface(id, nodeId);
  }

  @Delete(':id/nodes/:nodeId')
  removeNode(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.workspaces.removeNode(id, nodeId);
  }

  @Post(':id/sessions')
  bindSession(@Param('id') id: string, @Body() body: BindWorkspaceSessionDto) {
    return this.workspaces.bindSession(id, body.sessionId, body.nodeId);
  }
}
