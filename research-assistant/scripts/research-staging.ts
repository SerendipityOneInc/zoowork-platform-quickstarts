import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { runOutcome } from '@zoowork-ai/sdk'
import { agentResource, demo } from '../src/agent.js'
import { Conversations } from '../src/conversations.js'
import { cleanupConversations } from '../src/lifecycle.js'
import { Research, allEvents } from '../src/turns.js'
import { createApi } from '../src/app.js'
import { cleanupAgent, FoundationError, newState, readConfig, requireStaging, runtime, safeError, setupAgent, withStateLock } from '../src/platform.js'

let cleanupComplete = false
try {
  const config = readConfig(); requireStaging(config, process.argv.slice(2).includes('--confirm-staging'))
  const rt = runtime(config), filename = `research-smoke-${randomUUID()}.json`, path = resolve('.local', filename)
  await withStateLock(path, async () => {
    const sessionOnly = process.argv.includes('--session-only'), marker = `SESSION_${randomUUID().slice(0, 8)}`
    const models = await rt.client.listModels()
    const model = process.env.ZOOWORK_MODEL || models.find(m => /sonnet/i.test(m.model))?.model || models[0]?.model
    if (!model || !models.some(m => m.model === model)) throw new FoundationError('model_unavailable')
    const state = newState(config, demo, { ...agentResource(), model: { primary: model, max_tokens: sessionOnly ? 128 : 2200 },
      ...(sessionOnly ? { tool_policy: { deny: ['*'] }, persona: { docs: [{ name: 'AGENTS.md', content: '你是会话验证助手。严格按用户要求回复很短的文字。不使用工具。' }] } } : {}) })
    const store = new Conversations(resolve('.local', filename.slice(0, -5) + '-conversations'), state, rt.client)
    const research = new Research(store, 150_000)
    let failure: unknown
    try {
      console.log('RUN: bounded research staging (1 Agent, at most 2 Sessions / 2 turns)')
      await setupAgent(rt.client, state, path)
      const c = await store.create('Node.js release policy', randomUUID())
      await research.send(c.id, sessionOnly ? `请记住字符串 ${marker}，现在只回复这个字符串。` : '请用 web_search 查找 Node.js 官方发布计划，再用 web_fetch 读取 https://nodejs.org/en/about/previous-releases 和 https://github.com/nodejs/Release 。用中文写一份很短的简报，说明 LTS 与 Current 的选择原则。只做一次搜索、两次读取，不讨论具体版本号。', randomUUID(), async () => {})
      const first = await research.history(c.id)
      const events = await allEvents(rt.client, state.agentId!, c.sessionId!)
      if (!events.some(e => runOutcome(e) === 'succeeded') || first.status !== 'succeeded') throw new FoundationError('research_turn_not_successful')
      if (!sessionOnly) {
        if (!first.searches || first.fetches < 2 || !first.briefs.at(-1)?.ready) throw new FoundationError('search_fetch_or_citations_unavailable')
        const brief = first.briefs.at(-1)!
        const exported = await createApi(research).request(`http://localhost/api/sessions/${c.id}/briefs/${brief.id}/markdown`)
        if (exported.status !== 200 || await exported.text() !== brief.markdown) throw new FoundationError('export_mismatch')
        console.log(`PASS: search/fetch, cited brief, durable replay and exact Markdown export (${events.length} events)`)
      } else console.log(`PASS: first minimal Session turn (${events.length} events)`)
      await research.send(c.id, sessionOnly ? '上一轮让你记住的字符串是什么？只回复这个字符串。' : '基于刚才读过的资料，简单回答：为什么生产环境通常先考虑 LTS？不要检索，不要重新输出完整简报。', randomUUID(), async () => {})
      const continued = await new Research(store).history(c.id)
      if (continued.status !== 'succeeded' || continued.messages.filter(m => m.role === 'user').length !== 2 || continued.briefs.length !== (sessionOnly ? 0 : 1) ||
        (sessionOnly && !continued.messages.at(-1)?.text.includes(marker))) throw new FoundationError('continuation_or_restart_failed')
      const second = await store.create('Independent empty research', randomUUID())
      if ((await research.history(second.id)).messages.length) throw new FoundationError('session_isolation_failed')
      console.log('PASS: same-session follow-up, restart history and independent second Session')
    } catch (error) { failure = error }
    finally {
      await research.close(); rt.beginCleanup()
      try {
        if (!state.agentId) throw new FoundationError('agent_creation_uncertain_keep_state')
        await cleanupConversations(store); await cleanupAgent(rt.client, state, path); cleanupComplete = true
      } catch (error) {
        console.error(`Cleanup pending: ${safeError(error)}. Recovery: npm run cleanup -- ${filename}`)
        failure ??= error
      }
    }
    if (failure) throw failure
  })
  console.log('PASS: research staging; cleanup complete')
} catch (error) { console.error(`FAIL: ${safeError(error)}; cleanup ${cleanupComplete ? 'complete' : 'not confirmed'}`); process.exitCode = 1 }
