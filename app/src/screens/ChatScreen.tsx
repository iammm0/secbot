// ===================================================================
// 聊天页面 — SSE 流式交互，与 CLI TUI 行为一致
//
// 渲染流程（镜像 CLI）:
//   用户消息 → [planning] → task_phase(planning)
//            → [thought_start] → task_phase(thinking) → thinking(streaming)
//            → [thought_end/thought] → thinking(complete)
//            → [action_start] → task_phase(exec) → execution(running)
//            → [action_result] → exec_result
//            → … 多轮迭代 …
//            → [report] → task_phase(report) → report
//            → [response] → task_phase(done) → response
// ===================================================================

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useSSE } from '../hooks/useSSE';
import BlockRenderer from '../components/BlockRenderer';
import ChatDebugPanel from '../components/ChatDebugPanel';
import RootPermissionModal from '../components/RootPermissionModal';
import { submitRootResponse } from '../api/endpoints';
import type { RenderBlock, RootAction, SSEEvent } from '../types';

// 模式：ask=仅提问, agent=执行智能体（可选自动/专家）
const CHAT_MODES = [
  { id: 'ask', label: 'Ask' },
  { id: 'agent', label: 'Agent' },
] as const;
const AGENT_SUB = [
  { id: 'secbot-cli', label: '自动' },
  { id: 'superhackbot', label: '专家' },
] as const;
const MODELS = [
  { id: 'default', label: '后端默认' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { id: 'gemma3:3b', label: 'Ollama gpt-oss:20b' },
];
const PHASE_LABELS: Record<string, string> = {
  idle: '空闲',
  planning: '规划中',
  thinking: '推理中',
  exec: '执行工具',
  report: '生成报告中',
  done: '完成',
};

const BLOCK_FILTERS = [
  { id: 'all', label: 'Timeline' },
  { id: 'plan', label: 'Plan' },
  { id: 'tools', label: 'Tools' },
  { id: 'report', label: 'Report' },
] as const;

const QUICK_TASKS = [
  {
    id: 'network-discover',
    label: '内网发现',
    prompt: '扫描当前局域网并列出在线主机与开放端口。',
  },
  {
    id: 'defense-scan',
    label: '防御扫描',
    prompt: '执行一次完整安全扫描，并总结关键风险。',
  },
  {
    id: 'system-check',
    label: '系统体检',
    prompt: '检查当前系统状态，并指出值得关注的异常指标。',
  },
  {
    id: 'tool-overview',
    label: '工具盘点',
    prompt: '列出当前可用的安全工具分类，并给出适用场景。',
  },
] as const;

interface RootPromptState {
  requestId: string;
  command: string;
}

// 使用时间戳 + 自增 + 随机后缀，避免热重载/多实例时重复 key
let blockIdCounter = 0;
const nextBlockId = () =>
  `blk_${Date.now()}_${++blockIdCounter}_${Math.random().toString(36).slice(2, 9)}`;

export default function ChatScreen() {
  const { width } = useWindowDimensions();
  const isTabletLayout = width >= 900;
  const isCompactLayout = width < 420;

  const [blocks, setBlocks] = useState<RenderBlock[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'ask' | 'agent'>('agent');
  const [agentSubType, setAgentSubType] = useState<'secbot-cli' | 'superhackbot'>('secbot-cli');
  const [model, setModel] = useState('default');
  const [blockFilter, setBlockFilter] = useState<(typeof BLOCK_FILTERS)[number]['id']>('all');
  const [debugVisible, setDebugVisible] = useState(false);
  const [pendingRootRequest, setPendingRootRequest] = useState<RootPromptState | null>(null);
  const [rootSubmitting, setRootSubmitting] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const { streaming, startStream, stopStream } = useSSE();
  const eventLogRef = useRef<SSEEvent[]>([]);

  // 追踪当前流中的各阶段块 ID（用于流式更新）
  const thinkingIdRef = useRef<string | null>(null);
  const thinkingContentRef = useRef<string>('');
  const reportIdRef = useRef<string | null>(null);
  const reportContentRef = useRef<string>('');
  const phaseIdRef = useRef<string | null>(null);
  // 追踪当前执行块（用于填充 action_result）
  const currentExecRef = useRef<{
    id: string;
    tool: string;
    params?: Record<string, any>;
  } | null>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // 从 blocks 推导当前阶段（用于状态栏）
  const currentPhase = useMemo(() => {
    const last = [...blocks].reverse().find((b) => b.type === 'task_phase');
    const phase = (last as RenderBlock & { phase?: string })?.phase ?? 'idle';
    return phase;
  }, [blocks]);

  const filteredBlocks = useMemo(() => {
    if (blockFilter === 'all') return blocks;
    if (blockFilter === 'plan') {
      return blocks.filter((block) =>
        block.type === 'planning' ||
        block.type === 'task_phase' ||
        block.type === 'thinking',
      );
    }
    if (blockFilter === 'tools') {
      return blocks.filter((block) =>
        block.type === 'execution' ||
        block.type === 'exec_result' ||
        block.type === 'observation',
      );
    }
    return blocks.filter((block) =>
      block.type === 'report' ||
      block.type === 'response' ||
      block.type === 'error',
    );
  }, [blockFilter, blocks]);

  // -- 辅助: 追加新块 --
  const appendBlock = useCallback((block: RenderBlock) => {
    setBlocks((prev) => [...prev, block]);
  }, []);

  // -- 辅助: 更新指定块 --
  const updateBlock = useCallback((id: string, patch: Partial<RenderBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }, []);

  // -- 辅助: 更新或创建 task_phase --
  const setPhase = useCallback(
    (phase: RenderBlock['phase'], detail?: string) => {
      if (phaseIdRef.current) {
        updateBlock(phaseIdRef.current, { phase, detail });
      } else {
        const id = nextBlockId();
        phaseIdRef.current = id;
        appendBlock({
          id,
          type: 'task_phase',
          timestamp: new Date(),
          phase,
          detail,
        });
      }
    },
    [appendBlock, updateBlock],
  );

  // =================================================================
  // SSE 事件处理（与 CLI SessionManager._bridge_agent_event 对齐）
  // =================================================================
  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      const { event: eventType, data } = event;
      eventLogRef.current = [...eventLogRef.current, event].slice(-80);

      switch (eventType) {
        // ---- 规划 ----
        case 'planning': {
          setPhase('planning');
          appendBlock({
            id: nextBlockId(),
            type: 'planning',
            timestamp: new Date(),
            content: data.content || '',
            agent: data.agent,
          });
          break;
        }

        // ---- 推理开始 ----
        case 'thought_start': {
          const iteration = data.iteration || 1;
          setPhase('thinking');

          // 创建新的流式推理块
          const id = nextBlockId();
          thinkingIdRef.current = id;
          thinkingContentRef.current = '';
          appendBlock({
            id,
            type: 'thinking',
            timestamp: new Date(),
            iteration,
            content: '',
            streaming: true,
            agent: data.agent,
          });
          break;
        }

        // ---- 推理片段（流式追加） ----
        case 'thought_chunk': {
          const chunk = data.chunk || '';
          thinkingContentRef.current += chunk;
          if (thinkingIdRef.current) {
            updateBlock(thinkingIdRef.current, {
              content: thinkingContentRef.current,
            });
          }
          break;
        }

        // ---- 推理结束 ----
        case 'thought_end': {
          // thought_end 是 no-op（与 CLI 一致）
          break;
        }

        // ---- 推理完整内容 ----
        case 'thought': {
          const iteration = data.iteration || 1;
          const content = data.content || '';

          if (thinkingIdRef.current) {
            // 更新已有的流式块为完成状态
            updateBlock(thinkingIdRef.current, {
              content,
              streaming: false,
              iteration,
              agent: data.agent,
            });
          } else {
            // 没有流式块，直接创建完成的推理块
            appendBlock({
              id: nextBlockId(),
              type: 'thinking',
              timestamp: new Date(),
              iteration,
              content,
              streaming: false,
              agent: data.agent,
            });
          }
          thinkingIdRef.current = null;
          thinkingContentRef.current = '';
          break;
        }

        // ---- 工具执行开始 ----
        case 'action_start': {
          const tool = data.tool || 'unknown';
          const params = data.params || {};
          setPhase('exec', tool);

          const id = nextBlockId();
          currentExecRef.current = { id, tool, params };
          appendBlock({
            id,
            type: 'execution',
            timestamp: new Date(),
            tool,
            params,
            streaming: true, // running
            agent: data.agent,
          });
          break;
        }

        // ---- 工具执行结果 ----
        case 'action_result': {
          const tool = data.tool || '';
          const success = data.success !== false;
          const result = data.result;
          const error = data.error;

          if (currentExecRef.current && currentExecRef.current.tool === tool) {
            // 更新现有执行块: 停止 running，填充结果
            updateBlock(currentExecRef.current.id, {
              type: 'exec_result',
              streaming: false,
              success,
              result,
              error,
              agent: data.agent,
            });
          } else {
            // 单独创建结果块
            appendBlock({
              id: nextBlockId(),
              type: 'exec_result',
              timestamp: new Date(),
              tool,
              success,
              result,
              error,
              agent: data.agent,
            });
          }
          currentExecRef.current = null;
          break;
        }

        // ---- 观察 / 内容 ----
        case 'observation':
        case 'content': {
          appendBlock({
            id: nextBlockId(),
            type: 'observation',
            timestamp: new Date(),
            content: data.content || '',
            agent: data.agent,
          });
          break;
        }

        // ---- 报告 ----
        case 'report': {
          setPhase('report');
          const reportContent = data.content || data.report || '';

          if (reportIdRef.current) {
            reportContentRef.current += reportContent;
            updateBlock(reportIdRef.current, {
              content: reportContentRef.current,
              streaming: false,
              agent: data.agent,
            });
          } else {
            const id = nextBlockId();
            reportIdRef.current = id;
            reportContentRef.current = reportContent;
            appendBlock({
              id,
              type: 'report',
              timestamp: new Date(),
              content: reportContent,
              streaming: false,
              agent: data.agent,
            });
          }
          break;
        }

        // ---- 最终完整响应 ----
        case 'response': {
          setPhase('done');
          appendBlock({
            id: nextBlockId(),
            type: 'response',
            timestamp: new Date(),
            content: data.content || '',
            agent: data.agent ?? (mode === 'agent' ? agentSubType : mode),
            detail: data.agent ?? (mode === 'agent' ? agentSubType : mode),
          });
          break;
        }

        // ---- 错误 ----
        case 'error': {
          setPhase('done', '出错结束');
          appendBlock({
            id: nextBlockId(),
            type: 'error',
            timestamp: new Date(),
            error: data.error || '未知错误',
          });
          break;
        }

        // ---- 阶段状态（Interaction 编排下发，用于加载组件） ----
        case 'phase': {
          setPhase(data.phase || 'thinking', data.detail || '');
          break;
        }

        // ---- 流已接通（后端首包，用于确认 SSE 连接成功） ----
        case 'connected': {
          setPhase('thinking');
          break;
        }

        // ---- 需要 root / 管理员权限 ----
        case 'root_required': {
          const requestId = String(data.request_id || '');
          const command = String(data.command || '');
          setPendingRootRequest({ requestId, command });
          setRootError(null);
          appendBlock({
            id: nextBlockId(),
            type: 'observation',
            timestamp: new Date(),
            content: `需要管理员权限才能继续执行：\n\n${command}\n\n请在弹层中选择执行策略。`,
          });
          break;
        }

        // ---- 流结束 ----
        case 'done': {
          setPhase('done');
          // 清理 streaming 状态的块
          if (thinkingIdRef.current) {
            updateBlock(thinkingIdRef.current, { streaming: false });
          }
          if (reportIdRef.current) {
            updateBlock(reportIdRef.current, { streaming: false });
          }
          // 重置 refs
          thinkingIdRef.current = null;
          thinkingContentRef.current = '';
          reportIdRef.current = null;
          reportContentRef.current = '';
          phaseIdRef.current = null;
          currentExecRef.current = null;
          break;
        }
      }

      scrollToEnd();
    },
    [mode, agentSubType, appendBlock, updateBlock, setPhase, scrollToEnd],
  );

  // =================================================================
  // 发送消息
  // =================================================================
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    // 重置 refs
    thinkingIdRef.current = null;
    thinkingContentRef.current = '';
    reportIdRef.current = null;
    reportContentRef.current = '';
    phaseIdRef.current = null;
    currentExecRef.current = null;

    // 追加用户消息块
    appendBlock({
      id: nextBlockId(),
      type: 'user',
      timestamp: new Date(),
      content: trimmed,
    });
    setInput('');
    scrollToEnd();

    // 立即显示「连接中」阶段，保证列表和状态栏马上有反馈
    setPhase('thinking', '连接中…');

    // 发起 SSE 流：mode=ask|agent，agent 在 mode=agent 时有效
    const body: Record<string, string> = {
      message: trimmed,
      mode,
      agent: mode === 'agent' ? agentSubType : 'secbot-cli',
    };
    if (model !== 'default') body.model = model;
    startStream(
      '/api/chat',
      body,
      handleSSEEvent,
      () => scrollToEnd(),
      (error) => {
        // 失败时把当前阶段更新为「出错」，并追加错误块，状态同步
        if (phaseIdRef.current) {
          updateBlock(phaseIdRef.current, {
            phase: 'done',
            detail: '出错结束',
          });
          phaseIdRef.current = null;
        }
        appendBlock({
          id: nextBlockId(),
          type: 'error',
          timestamp: new Date(),
          error: `连接错误: ${error.message}`,
        });
        scrollToEnd();
      },
    );
  }, [input, mode, agentSubType, model, streaming, startStream, handleSSEEvent, appendBlock, updateBlock, setPhase, scrollToEnd]);

  const statusText = useMemo(() => {
    if (!streaming && currentPhase === 'done') return '空闲';
    const label = PHASE_LABELS[currentPhase] ?? currentPhase;
    return streaming ? `流式中 · ${label}` : label;
  }, [streaming, currentPhase]);

  const debugState = useMemo(
    () => ({
      mode: mode === 'agent'
        ? `Agent · ${AGENT_SUB.find((a) => a.id === agentSubType)?.label ?? agentSubType}`
        : (CHAT_MODES.find((m) => m.id === mode)?.label ?? mode),
      model: MODELS.find((m) => m.id === model)?.label ?? model,
      currentPhase: PHASE_LABELS[currentPhase] ?? currentPhase,
      streaming,
      blocksCount: blocks.length,
      phaseId: phaseIdRef.current,
      thinkingId: thinkingIdRef.current,
      reportId: reportIdRef.current,
      currentExecTool: currentExecRef.current?.tool ?? null,
    }),
    [mode, agentSubType, model, currentPhase, streaming, blocks.length],
  );

  const handleQuickTask = useCallback((prompt: string) => {
    setInput(prompt);
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 0);
  }, []);

  const handleRootResponse = useCallback(
    async (action: RootAction, password?: string) => {
      if (!pendingRootRequest) return;
      setRootSubmitting(true);
      setRootError(null);
      try {
        await submitRootResponse({
          request_id: pendingRootRequest.requestId,
          action,
          password,
        });
        appendBlock({
          id: nextBlockId(),
          type: 'observation',
          timestamp: new Date(),
          content: `已提交管理员权限响应：${action}${password ? '（已附带密码）' : ''}`,
        });
        setPendingRootRequest(null);
      } catch (err: any) {
        setRootError(err?.message || '权限响应提交失败');
      } finally {
        setRootSubmitting(false);
      }
    },
    [pendingRootRequest, appendBlock],
  );

  // =================================================================
  // 渲染
  // =================================================================
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? (isTabletLayout ? 72 : 94) : 0}
    >
      <View style={[styles.pageShell, isTabletLayout && styles.pageShellTablet]}>
        {/* 模式 Ask / Agent；Agent 时显示 自动/专家 */}
        <View style={[styles.toolbar, isTabletLayout && styles.toolbarTablet]}>
          <View style={styles.toolbarTopRow}>
            <View style={[styles.modeRow, isCompactLayout && styles.modeRowCompact]}>
              {CHAT_MODES.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modeBtn, mode === m.id && styles.modeBtnActive]}
                  onPress={() => setMode(m.id)}
                >
                  <Text
                    style={[
                      styles.modeBtnText,
                      mode === m.id && styles.modeBtnTextActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {mode === 'agent' && (
              <View style={styles.agentSubRow}>
                {AGENT_SUB.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.agentSubBtn,
                      agentSubType === a.id && styles.agentSubBtnActive,
                    ]}
                    onPress={() => setAgentSubType(a.id)}
                  >
                    <Text
                      style={[
                        styles.agentSubBtnText,
                        agentSubType === a.id && styles.agentSubBtnTextActive,
                      ]}
                    >
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.toolbarBottomRow}>
            <TouchableOpacity
              style={[styles.modelBtn, isCompactLayout && styles.modelBtnCompact]}
              onPress={() => {
                const idx = MODELS.findIndex((m) => m.id === model);
                setModel(MODELS[(idx + 1) % MODELS.length].id);
              }}
            >
              <Ionicons name="server-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.modelBtnText} numberOfLines={1}>
                {MODELS.find((m) => m.id === model)?.label ?? model}
              </Text>
            </TouchableOpacity>
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: streaming ? Colors.primary : Colors.success },
                ]}
              />
              <Text style={styles.statusText} numberOfLines={1}>
                {statusText}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={() => setDebugVisible(true)}
            >
              <Ionicons name="bug-outline" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.controlDeck, isTabletLayout && styles.controlDeckTablet]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {BLOCK_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterChip,
                  blockFilter === filter.id && styles.filterChipActive,
                ]}
                onPress={() => setBlockFilter(filter.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    blockFilter === filter.id && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickTaskRow}
          >
            {QUICK_TASKS.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.quickTaskChip}
                disabled={streaming}
                onPress={() => handleQuickTask(task.prompt)}
              >
                <Text style={styles.quickTaskChipText}>{task.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <FlatList
          ref={flatListRef}
          style={[styles.blockListView, isTabletLayout && styles.blockListViewTablet]}
          data={filteredBlocks}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={({ item }) => <BlockRenderer block={item} />}
          contentContainerStyle={[styles.blockList, isTabletLayout && styles.blockListTablet]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={64}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyText}>
                {blocks.length > 0 ? '当前视图下暂无内容' : '发送消息开始对话'}
              </Text>
              <Text style={styles.emptySubtext}>
                {blocks.length > 0
                  ? `当前筛选：${BLOCK_FILTERS.find((filter) => filter.id === blockFilter)?.label ?? blockFilter}`
                  : `${CHAT_MODES.find((m) => m.id === mode)?.label}${mode === 'agent' ? ` · ${AGENT_SUB.find((a) => a.id === agentSubType)?.label}` : ''} · ${MODELS.find((m) => m.id === model)?.label}`}
              </Text>
            </View>
          }
        />

        {/* 输入栏 */}
        <View style={[styles.inputBar, isTabletLayout && styles.inputBarTablet]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="输入消息..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={4000}
            editable={!streaming}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />

          {streaming ? (
            <TouchableOpacity onPress={stopStream} style={styles.sendBtn}>
              <Ionicons name="stop-circle" size={28} color={Colors.danger} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleSend}
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              disabled={!input.trim()}
            >
              <Ionicons
                name="send"
                size={22}
                color={input.trim() ? Colors.primary : Colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ChatDebugPanel
        visible={debugVisible}
        onClose={() => setDebugVisible(false)}
        state={debugState}
        eventLog={[...eventLogRef.current]}
      />

      <RootPermissionModal
        visible={pendingRootRequest !== null}
        command={pendingRootRequest?.command ?? ''}
        loading={rootSubmitting}
        error={rootError}
        onClose={() => {
          void handleRootResponse('deny');
        }}
        onSubmit={(action, password) => {
          void handleRootResponse(action, password);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pageShell: {
    flex: 1,
    width: '100%',
  },
  pageShellTablet: {
    alignSelf: 'center',
    maxWidth: 980,
  },
  toolbar: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  toolbarTablet: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  toolbarTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  toolbarBottomRow: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    padding: 2,
  },
  modeRowCompact: {
    flex: 1,
  },
  modeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  modeBtnActive: {
    backgroundColor: Colors.primary,
  },
  modeBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: Colors.background,
  },
  agentSubRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    padding: 2,
  },
  agentSubBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  agentSubBtnActive: {
    backgroundColor: Colors.accent,
  },
  agentSubBtnText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  agentSubBtnTextActive: {
    color: Colors.background,
  },
  modelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 220,
    minWidth: 116,
    flexShrink: 1,
  },
  modelBtnCompact: {
    maxWidth: 160,
  },
  modelBtnText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  debugBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDeck: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: Spacing.sm,
    backgroundColor: Colors.background,
  },
  controlDeckTablet: {
    paddingHorizontal: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingRight: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  filterChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  quickTaskRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingRight: Spacing.md,
  },
  quickTaskChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickTaskChipText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '600',
  },
  blockListView: {
    flex: 1,
  },
  blockListViewTablet: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  blockList: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    flexGrow: 1,
  },
  blockListTablet: {
    paddingHorizontal: 0,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  inputBarTablet: {
    paddingHorizontal: 0,
    marginBottom: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.md,
    minHeight: 48,
    maxHeight: 144,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlignVertical: 'top',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
