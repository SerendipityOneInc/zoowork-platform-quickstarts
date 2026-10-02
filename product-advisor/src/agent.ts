import type { AgentResource } from '@zoowork-ai/sdk'

export const demo = 'product-advisor'
// Feature configuration belongs here in the next session.
export function agentResource(): AgentResource {
  const model = process.env.ZOOWORK_MODEL
  return { name: 'Platform Product Advisor', include_global_skills: false,
    ...(model ? { model: { primary: model } } : {}),
  }
}
