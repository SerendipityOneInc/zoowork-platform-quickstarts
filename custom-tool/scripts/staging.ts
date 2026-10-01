import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { assistantText, runOutcome } from '@zoowork-ai/sdk'
import { agentResource, demo } from '../src/agent.js'
import { cleanupAgent, FoundationError, newState, readConfig, requireStaging, runtime, safeError, saveState, setupAgent, withStateLock } from '../src/platform.js'

let cleanupComplete = false
try {
  const config = readConfig()
  requireStaging(config, process.argv.slice(2).includes('--confirm-staging'))
  const rt = runtime(config)
  const filename = `smoke-${randomUUID()}.json`
  const path = resolve('.local', filename)
  await withStateLock(path, async () => {
    const models = await rt.client.listModels()
    const model = process.env.ZOOWORK_MODEL || models[0]?.model
    if (!model || !models.some(m => m.model === model)) throw new FoundationError('model_unavailable')
    const state = newState(config, demo, { ...agentResource(), model: { primary: model, max_tokens: 128 },
      include_global_skills: false, tool_policy: { deny: ['*'] } })
    let failure: unknown
    try {
      console.log('RUN: Platform Agent lifecycle')
      const agentId = await setupAgent(rt.client, state, path)
      state.sessionRequest = {
        metadata: { source: 'platform-starter-smoke', instance: state.instance },
        initial_events: [{ type: 'user.message', content: 'Reply PLATFORM_STARTER_OK only. Do not use tools, files or schedules.' }],
      }
      await saveState(path, state)
      const session = await rt.client.createSession(agentId, state.sessionRequest, `platform-starter:session:${state.instance}`)
      state.sessionId = session.session_id
      await saveState(path, state)
      let text = ''
      let succeeded = false
      for await (const event of rt.client.streamEvents(agentId, session.session_id)) {
        text += assistantText(event)
        const outcome = runOutcome(event)
        if (outcome) { succeeded = outcome === 'succeeded'; break }
      }
      if (!succeeded || !text.trim()) throw new FoundationError('turn_not_successful')
      const history = await rt.client.listAllEvents(agentId, session.session_id, { types: ['agent.assistant'] })
      if (history.map(assistantText).join('') !== text) throw new FoundationError('history_stream_mismatch')
      console.log('PASS: model turn and REST/SSE agreement')
    } catch (error) { failure = error }
    finally {
      rt.beginCleanup()
      try {
        if (state.agentId) { await cleanupAgent(rt.client, state, path); cleanupComplete = true }
        else throw new FoundationError('agent_creation_uncertain_keep_state')
      } catch (error) {
        console.error(`Cleanup pending: ${safeError(error)}. Recovery state: .local/${filename}`)
        console.error(`After checking the same Project key: npm run cleanup -- ${filename}`)
        failure ??= error
      }
    }
    if (failure) throw failure
  })
  console.log('PASS: foundation staging smoke; cleanup complete')
} catch (error) {
  console.error(`FAIL: ${safeError(error)}; cleanup ${cleanupComplete ? 'complete' : 'not confirmed'}`)
  process.exitCode = 1
}
