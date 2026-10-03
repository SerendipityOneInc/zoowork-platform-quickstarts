import type { AgentResource } from '@zoowork-ai/sdk'
import { researchPrompt } from './research-prompt.js'

export const demo = 'research-assistant'
export function agentResource(): AgentResource {
  const model = process.env.ZOOWORK_MODEL
  return { name: 'Platform Research Assistant', include_global_skills: false,
    persona: { docs: [{ name: 'AGENTS.md', content: researchPrompt }] },
    tool_policy: { allow: ['web_search', 'web_fetch'] },
    ...(model ? { model: { primary: model } } : {}),
  }
}
