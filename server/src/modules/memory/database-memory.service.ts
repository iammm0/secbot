import { DatabaseService } from '../database/database.service';

export class DatabaseMemory {
  constructor(
    private readonly dbManager: DatabaseService,
    private readonly agentType: string,
    private readonly sessionId: string,
  ) {}

  async save_conversation(userMessage: string, assistantMessage: string): Promise<void> {
    this.dbManager.saveConversation({
      agentType: this.agentType,
      userMessage,
      assistantMessage,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      metadata: '{}',
    });
  }
}
