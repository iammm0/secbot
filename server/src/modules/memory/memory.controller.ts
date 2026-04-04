import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MemoryService } from './memory.service';
import {
  AddEpisodeRequestDto,
  AddKnowledgeRequestDto,
  AddVectorMemoryRequestDto,
  ClearMemoryRequestDto,
  ContextQueryDto,
  DistillConversationRequestDto,
  RecallQueryDto,
  RememberRequestDto,
  SearchVectorMemoryRequestDto,
} from './dto/memory.dto';

@Controller('api/memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post('remember')
  async remember(@Body() body: RememberRequestDto) {
    await this.memoryService.remember(
      body.content,
      body.memory_type ?? 'short_term',
      body.importance ?? 0.5,
      body.metadata ?? {},
    );
    return { success: true };
  }

  @Get('recall')
  async recall(@Query() query: RecallQueryDto) {
    const memories = await this.memoryService.recall(
      query.query ?? '',
      query.memory_type,
      query.limit ?? 5,
    );
    return { memories };
  }

  @Get('context')
  async getContext(@Query() query: ContextQueryDto) {
    const context = await this.memoryService.get_context_for_agent(query.query ?? '');
    return { context };
  }

  @Get('list')
  list(@Query() query: RecallQueryDto) {
    return {
      memories: this.memoryService.list_memories(query.memory_type, query.limit),
    };
  }

  @Post('distill')
  async distill(@Body() body: DistillConversationRequestDto) {
    await this.memoryService.distill_from_conversation(body.conversation, body.summary);
    return { success: true };
  }

  @Post('episode')
  async addEpisode(@Body() body: AddEpisodeRequestDto) {
    await this.memoryService.add_episode(body.event, body.outcome, body.target ?? '');
    return { success: true };
  }

  @Post('knowledge')
  async addKnowledge(@Body() body: AddKnowledgeRequestDto) {
    await this.memoryService.add_knowledge(
      body.fact,
      body.category ?? 'general',
      body.importance ?? 0.5,
    );
    return { success: true };
  }

  @Post('clear')
  async clear(@Body() body: ClearMemoryRequestDto) {
    await this.memoryService.clear(body.memory_type);
    return { success: true };
  }

  @Get('stats')
  stats() {
    return this.memoryService.get_stats();
  }

  @Post('vector/add')
  async addVector(@Body() body: AddVectorMemoryRequestDto) {
    const itemId = await this.memoryService.add_vector_memory(
      body.content,
      body.vector,
      body.memory_type ?? 'short_term',
      body.metadata ?? {},
    );
    return { success: true, item_id: itemId };
  }

  @Post('vector/search')
  async searchVector(@Body() body: SearchVectorMemoryRequestDto) {
    const results = await this.memoryService.search_vector_memories(
      body.query_vector,
      body.memory_type,
      body.limit ?? 10,
    );
    return { results };
  }

  @Get('vector/stats')
  vectorStats() {
    return this.memoryService.get_vector_stats();
  }
}
