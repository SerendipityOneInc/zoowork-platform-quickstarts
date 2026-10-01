import { ZooworkError, type AgentResource, type ZooworkClient } from '@zoowork-ai/sdk'
import { Conversations } from './conversations.js'
import { FoundationError, ownedAgent, saveState, type State } from './platform.js'

function contains(actual: unknown, desired: unknown): boolean {
  if (Array.isArray(desired)) return Array.isArray(actual) && actual.length === desired.length && desired.every((v, i) => contains(actual[i], v))
  if (desired && typeof desired === 'object') return !!actual && typeof actual === 'object' &&
    Object.entries(desired).every(([k, v]) => contains((actual as Record<string, unknown>)[k], v))
  return actual === desired
}
export async function updateAgent(client: ZooworkClient, state: State, path: string, resource: AgentResource): Promise<void> {
  const current = await ownedAgent(client, state)
  // Keep resource as the immutable create body. A pending update retains its own exact sections.
  const sections = state.pendingUpdate ?? { ...resource, labels: state.resource.labels }
  state.pendingUpdate = sections; await saveState(path, state)
  if (!contains(current.declared, sections)) await client.updateAgent(state.agentId!, sections)
  const updated = await ownedAgent(client, state)
  if (!contains(updated.declared, sections)) throw new FoundationError('agent_update_not_confirmed')
  delete state.pendingUpdate; await saveState(path, state)
}
export async function cleanupConversations(store: Conversations): Promise<void> {
  await ownedAgent(store.client, store.state)
  const records = await store.list()
  if (records.some(c => !c.sessionId)) throw new FoundationError('session_creation_uncertain_keep_state')
  // No Project scan: only exact local IDs, with Agent labels and Session metadata checked before deletion.
  for (const c of records) {
    if (c.status === 'deleted') continue
    try {
      await store.owned(c.id)
      await store.client.deleteSession(c.agentId, c.sessionId!)
    } catch (error) { if (!(error instanceof ZooworkError && error.status === 404)) throw error }
    c.status = 'deleted'; delete c.activeInput; c.inputs = {}; await store.save(c)
  }
}
