// Adapted from anthropics/claude-quickstarts (MIT), managed-agents/chat-sdk/src/bot.ts.
// Snapshot and retained license: ../REFERENCES.md and ../third-party/anthropic-MIT.txt.
import { Chat, ConsoleLogger } from 'chat'
import { createWebAdapter } from '@chat-adapter/web'
import { createMemoryState } from '@chat-adapter/state-memory'
import { localOwner } from './conversations.js'
import { safeError } from './platform.js'
import type { Research } from './turns.js'

export function localRequest(request: Request): boolean {
  const url = new URL(request.url), origin = request.headers.get('origin')
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && (!origin || origin === url.origin)
}
export function createBot(research: Research) {
  const logger = new ConsoleLogger('silent')
  const adapters = { web: createWebAdapter({ userName: 'research-assistant', persistMessageHistory: false,
    logger, getUser: request => localRequest(request) ? { id: localOwner, name: '你' } : null }) }
  const bot = new Chat({ userName: 'research-assistant', adapters, state: createMemoryState(), concurrency: 'concurrent', logger })
  bot.onDirectMessage(async (thread, message) => {
    if (message.author.isMe) return
    const { conversationId, userId } = adapters.web.decodeThreadId(thread.id)
    if (userId !== localOwner) return
    const raw = message.raw as { metadata?: { requestId?: string } }
    try {
      await research.send(conversationId, message.text.trim(), raw.metadata?.requestId ?? '', text => thread.post(text))
    } catch (error) {
      const code = safeError(error)
      console.error(`Research observer: ${code}`)
      await thread.post('暂时无法确认本次研究状态。请重新读取会话；已提交的问题不会自动重发。').catch(() => {})
    }
  })
  return bot
}
