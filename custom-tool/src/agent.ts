import type { AgentResource } from '@zoowork-ai/sdk'

export const demo = 'custom-tool'
// Feature configuration belongs here in the next session.
export function agentResource(): AgentResource {
  const model = process.env.ZOOWORK_MODEL
  return { name: 'Platform Custom Tool starter', include_global_skills: false,
    ...(model ? { model: { primary: model } } : {}),
  }
}
