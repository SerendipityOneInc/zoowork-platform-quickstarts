import type { AgentResource } from '@zoowork-ai/sdk'

export const demo = 'rag'
// Feature configuration belongs here in the next session.
export function agentResource(): AgentResource {
  const model = process.env.ZOOWORK_MODEL
  return { name: 'Platform External RAG starter', include_global_skills: false,
    ...(model ? { model: { primary: model } } : {}),
  }
}
