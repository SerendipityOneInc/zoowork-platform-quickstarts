import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ZooworkClient, SessionRecord } from '@zoowork-ai/sdk'
import { FoundationError, ownedAgent, type State } from './platform.js'
import { SdkDebug, traceClient } from './sdk-debug.js'

export const localOwner = 'local'
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value)
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export interface InputIntent { key: string; hash: string; text?: string; baseline: number; eventId?: string; seq?: number; runId?: string; outcome?: string; errorCode?: string }
export interface Conversation {
  version: 1; id: string; instance: string; owner: string; baseUrl: string; agentId: string
  sessionId?: string; title: string; createdAt: string; updatedAt: string; createRequestId: string; topicHash?: string
  createBody: { metadata: Record<string, string> }; createKey: string; status: string
  inputs: Record<string, InputIntent>; activeInput?: string; cursor?: string; lastSeq?: number
}
export class Conversations {
  private queue: Promise<unknown> = Promise.resolve()
  readonly client: ZooworkClient
  constructor(readonly directory: string, readonly state: State, client: ZooworkClient, readonly debug = new SdkDebug()) {
    this.client = traceClient(client, debug)
  }
  async serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(action); this.queue = next
    return next
  }
  async save(record: Conversation, touch = true): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const path = join(this.directory, record.id + '.json'), temp = path + '.' + randomUUID() + '.tmp'
    if (touch) record.updatedAt = new Date().toISOString()
    await writeFile(temp, JSON.stringify(record) + '\n', { mode: 0o600, flag: 'wx' }); await rename(temp, path)
  }
  async read(id: string): Promise<Conversation> {
    if (!validId(id)) throw new FoundationError('conversation_not_found')
    let c: Conversation
    try { c = JSON.parse(await readFile(join(this.directory, id + '.json'), 'utf8')) as Conversation }
    catch { throw new FoundationError('conversation_not_found') }
    if (c.version !== 1 || c.id !== id || c.instance !== this.state.instance || c.owner !== localOwner ||
      c.baseUrl !== this.state.baseUrl || c.agentId !== this.state.agentId) throw new FoundationError('conversation_not_found')
    return c
  }
  async list(): Promise<Conversation[]> {
    let files: string[]
    try { files = await readdir(this.directory) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
    const out: Conversation[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      out.push(await this.read(file.slice(0, -5)))
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async owned(id: string): Promise<{ record: Conversation; session: SessionRecord }> {
    const record = await this.read(id)
    if (!record.sessionId) throw new FoundationError('session_creation_uncertain')
    await ownedAgent(this.client, this.state)
    const session = await this.client.getSession(record.agentId, record.sessionId)
    const meta = session.metadata
    if (meta?.app !== 'research-assistant' || meta.instance !== record.instance || meta.owner !== localOwner ||
      meta.conversation_id !== record.id || session.deleted === true) throw new FoundationError('conversation_not_found')
    return { record, session }
  }
  async create(topic: string, requestId: string): Promise<Conversation> {
    if (!topic.trim() || topic.length > 4000 || !validId(requestId)) throw new FoundationError('invalid_input')
    return this.serial(async () => {
      await ownedAgent(this.client, this.state)
      let record = (await this.list()).find(c => c.createRequestId === requestId)
      if (record && record.topicHash !== digest(topic.trim())) throw new FoundationError('request_content_conflict')
      if (!record) {
        const id = randomUUID(), now = new Date().toISOString(), title = topic.trim().slice(0, 120)
        record = { version: 1, id, instance: this.state.instance, owner: localOwner, baseUrl: this.state.baseUrl,
          agentId: this.state.agentId!, title, createdAt: now, updatedAt: now, createRequestId: requestId, topicHash: digest(topic.trim()),
          createKey: `research:${this.state.instance}:${id}`, status: 'creating', inputs: {},
          createBody: { metadata: { app: 'research-assistant', instance: this.state.instance, owner: localOwner, conversation_id: id, title } } }
        await this.save(record)
      }
      if (!record.sessionId) {
        const session = await this.client.createSession(record.agentId, record.createBody, record.createKey)
        if (!session.session_id) throw new FoundationError('invalid_create_receipt')
        record.sessionId = session.session_id; record.status = 'idle'; await this.save(record)
      }
      return record
    })
  }
  async recoverIndex(): Promise<number> {
    await ownedAgent(this.client, this.state)
    let cursor: string | undefined, count = 0
    do {
      const page = await this.client.listSessionPage(this.state.agentId!, { cursor, includeArchived: true })
      for (const session of page.sessions) {
        const m = session.metadata
        if (m?.app !== 'research-assistant' || m.instance !== this.state.instance || m.owner !== localOwner ||
          !validId(m.conversation_id) || !session.session_id) continue
        try { await readFile(join(this.directory, m.conversation_id + '.json'), 'utf8'); await this.read(m.conversation_id); continue }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
        const now = new Date().toISOString(), title = String(m.title ?? 'Research').slice(0, 120)
        await this.save({ version: 1, id: m.conversation_id, instance: this.state.instance, owner: localOwner,
          baseUrl: this.state.baseUrl, agentId: this.state.agentId!, sessionId: session.session_id, title,
          createdAt: now, updatedAt: now, createRequestId: `recovered-${session.session_id}`, createBody: { metadata: m as Record<string, string> },
          createKey: `recovered:${session.session_id}`, inputs: {}, status: session.run_status ?? 'idle' }); count++
      }
      if (page.next_cursor === cursor) throw new FoundationError('non_advancing_cursor')
      cursor = page.next_cursor ?? undefined
    } while (cursor)
    return count
  }
}
