export type ActorId = 'user' | 'agent' | 'client' | 'server' | 'tool'
export type PacketKind = 'request' | 'protocol' | 'result' | 'reasoning' | 'answer'

export interface WalkthroughStep {
  title: string
  actor: ActorId
  phase: string
  explanation: string
  packet?: { from: ActorId; to: ActorId; label: string; kind: PacketKind }
  detail: string
  request?: string
  response?: string
  context?: string
  decision?: string
}

export interface Scenario {
  id: string
  name: string
  category: string
  description: string
  request: string
  service: string
  tools: [string, string, string]
  firstResult: string[]
  secondResult: string
  thirdResult: string[]
  finalAnswer: string
  contextLabels: [string, string, string]
  steps: WalkthroughStep[]
}

const request = {
  github: 'Find the most relevant MCP issue, inspect it, and explain how it could be fixed.',
  support: 'Help Jordan understand a delayed order and whether a refund has been issued.',
  developer: 'Investigate issue #421, find the relevant code, run its tests, and suggest a fix.',
}

const jsonRequest = (name: string, args: string) => `{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "${name}",
    "arguments": ${args}
  }
}`

const jsonResponse = (text: string) => `{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [{ "type": "text", "text": "${text}" }]
  }
}`

function createSteps(config: Omit<Scenario, 'steps'>): WalkthroughStep[] {
  const [firstTool, secondTool, thirdTool] = config.tools
  const firstArg = config.id === 'github' ? '"query": "MCP"' : config.id === 'support' ? '"email": "jordan@example.com"' : '"issue_id": 421'
  const secondArg = config.id === 'github' ? '"issue_id": 421' : config.id === 'support' ? '"customer_id": "CUS-2048"' : '"query": "connection timeout"'
  const thirdArg = config.id === 'github' ? '"query": "MCP connection timeout transport"' : config.id === 'support' ? '"order_id": "ORD-8821"' : '"path": "transport/connection-manager.ts"'
  const firstSummary = config.firstResult.join(' · ')

  return [
    {
      title: 'A goal enters the system',
      actor: 'user',
      phase: '01 · THE REQUEST',
      explanation: 'The user gives the application a goal in plain language.',
      packet: { from: 'user', to: 'agent', label: 'User request', kind: 'request' },
      detail: 'The request is the starting context. MCP has not been involved yet.',
      context: 'Original user request',
    },
    {
      title: 'The agent plans its next move',
      actor: 'agent',
      phase: '02 · AGENT REASONING',
      explanation: 'The agent interprets the goal and chooses a capability. This decision belongs to the agent—not MCP.',
      packet: { from: 'agent', to: 'client', label: `Choose ${firstTool}`, kind: 'reasoning' },
      detail: 'The agent breaks down the request, identifies missing information, and selects the first tool.',
      decision: `Goal: ${config.description}\nNext action: ${firstTool}`,
    },
    {
      title: 'The client prepares an MCP call',
      actor: 'client',
      phase: '03 · MCP CLIENT',
      explanation: `The host's MCP client packages the agent's tool selection as a protocol request.`,
      packet: { from: 'client', to: 'server', label: 'tools/call', kind: 'protocol' },
      detail: `The MCP client communicates with the ${config.service} server using JSON-RPC.`,
      request: jsonRequest(firstTool, `{ ${firstArg} }`),
    },
    {
      title: 'The server routes the request',
      actor: 'server',
      phase: '04 · MCP SERVER',
      explanation: 'The server validates the input, finds the requested tool, then calls its integration.',
      packet: { from: 'server', to: 'tool', label: `Run ${firstTool}`, kind: 'protocol' },
      detail: 'MCP standardizes the connection. The server owns tool validation and execution.',
      request: jsonRequest(firstTool, `{ ${firstArg} }`),
    },
    {
      title: 'The external service responds',
      actor: 'tool',
      phase: '05 · EXTERNAL TOOL',
      explanation: `The ${config.service} integration returns real-world data to the MCP server.`,
      packet: { from: 'tool', to: 'server', label: 'Tool result', kind: 'result' },
      detail: 'A tool returns data; it does not decide what the agent should do next.',
      response: jsonResponse(firstSummary),
    },
    {
      title: 'The result travels back',
      actor: 'server',
      phase: '06 · RESULT RETURN',
      explanation: 'The server returns the tool result over the same MCP connection.',
      packet: { from: 'server', to: 'client', label: 'Structured result', kind: 'result' },
      detail: 'MCP carries the response back to the client. The protocol does not initiate another tool call.',
      response: jsonResponse(firstSummary),
    },
    {
      title: 'New information reaches the agent',
      actor: 'agent',
      phase: '07 · CONTEXT UPDATE',
      explanation: 'The client delivers the result to the agent. It joins the original request as new context.',
      packet: { from: 'client', to: 'agent', label: 'Result → context', kind: 'result' },
      detail: 'This is the hand-off that makes the result available to the next reasoning step.',
      context: config.contextLabels[0],
      response: jsonResponse(firstSummary),
    },
    {
      title: 'The agent reasons again',
      actor: 'agent',
      phase: '08 · NEXT DECISION',
      explanation: 'With the first result in context, the agent decides what would help next.',
      packet: { from: 'agent', to: 'client', label: `Choose ${secondTool}`, kind: 'reasoning' },
      detail: 'The previous result informs this choice. The agent—not the MCP server—selects the next tool.',
      decision: `Available context:\nUser request + ${config.contextLabels[0]}\n\nNext action: ${secondTool}`,
      context: config.contextLabels[0],
    },
    {
      title: 'A second tool call is made',
      actor: 'client',
      phase: '09 · SECOND MCP CALL',
      explanation: `The agent's next choice becomes another MCP request: ${secondTool}.`,
      packet: { from: 'client', to: 'server', label: 'tools/call · 2', kind: 'protocol' },
      detail: 'The same client/server protocol supports a new call; this sequence is chosen by the agent.',
      request: jsonRequest(secondTool, `{ ${secondArg} }`),
      context: config.contextLabels[0],
    },
    {
      title: 'Another result expands context',
      actor: 'agent',
      phase: '10 · CONTEXT GROWS',
      explanation: `The ${secondTool} result returns to the agent and joins what it already knows.`,
      packet: { from: 'tool', to: 'agent', label: 'Result → context', kind: 'result' },
      detail: 'The agent can now reason over the original request and both tool results together.',
      context: config.contextLabels[1],
      response: jsonResponse(config.secondResult),
    },
    {
      title: 'The loop continues',
      actor: 'client',
      phase: '11 · THIRD TOOL',
      explanation: `The agent chooses ${thirdTool} based on the accumulated context, then receives supporting evidence.`,
      packet: { from: 'client', to: 'server', label: `tools/call · ${thirdTool}`, kind: 'protocol' },
      detail: 'The server executes the tool and returns its result. The agent can keep looping—or stop when ready.',
      request: jsonRequest(thirdTool, `{ ${thirdArg} }`),
      response: jsonResponse(config.thirdResult.join(' · ')),
      context: config.contextLabels[2],
      decision: `Context: request + ${config.contextLabels[1]}\nNext action: ${thirdTool}`,
    },
    {
      title: 'The agent synthesizes an answer',
      actor: 'agent',
      phase: '12 · FINAL ANSWER',
      explanation: 'The agent combines the request and accumulated tool results into a response for the user.',
      packet: { from: 'agent', to: 'user', label: 'Final answer', kind: 'answer' },
      detail: 'MCP connected the capabilities. The agent performed the reasoning and wrote the final answer.',
      context: 'Request + 3 tool results',
      response: config.finalAnswer,
    },
  ]
}

const definitions: Omit<Scenario, 'steps'>[] = [
  {
    id: 'github',
    name: 'GitHub investigation',
    category: 'ISSUE → CODE → EXPLANATION',
    description: 'Find an issue, inspect it, then locate supporting code.',
    request: request.github,
    service: 'GitHub',
    tools: ['search_issues', 'get_issue', 'search_code'],
    firstResult: ['#421 MCP connection timeout', '#438 Tool discovery issue', '#451 Resource loading issue'],
    secondResult: 'Connection fails after initialization. Remote server · transport layer',
    thirdResult: ['transport/client.ts', 'connection-manager.ts', 'retry-handler.ts'],
    finalAnswer: 'Issue #421 points to connection handling in the transport layer. The relevant implementation is in connection-manager.ts, where retry and timeout behavior could be adjusted.',
    contextLabels: ['3 matching issues', 'Issue #421 details', 'Code search results'],
  },
  {
    id: 'support',
    name: 'Customer support',
    category: 'CUSTOMER → ORDER → REFUND',
    description: 'Identify a customer, check an order, then verify its refund.',
    request: request.support,
    service: 'Support platform',
    tools: ['get_customer', 'get_orders', 'get_refund_status'],
    firstResult: ['Jordan Lee · CUS-2048', '2 recent orders', 'Preferred contact: email'],
    secondResult: 'ORD-8821 · delivery delayed · expected Oct 8',
    thirdResult: ['Refund requested Oct 2', 'Status: processing', 'Estimated completion: 3–5 days'],
    finalAnswer: 'Jordan’s order ORD-8821 is delayed until October 8. Its refund request is still processing and is expected to complete within 3–5 days.',
    contextLabels: ['Customer profile', 'Order ORD-8821', 'Refund status'],
  },
  {
    id: 'developer',
    name: 'Developer workflow',
    category: 'ISSUE → REPOSITORY → TESTS',
    description: 'Trace a bug through a repository and its test suite.',
    request: request.developer,
    service: 'Code host',
    tools: ['get_issue', 'search_repository', 'run_tests'],
    firstResult: ['#421 Connection timeout', 'First reported Sep 18', 'Label: bug'],
    secondResult: 'connection-manager.ts · transport/retry.ts',
    thirdResult: ['18 tests passed', '1 timeout regression reproduced', 'transport/connection.test.ts'],
    finalAnswer: 'The timeout regression is in the transport connection manager. A test reproduces it, so adjust retry handling there and run the transport suite again.',
    contextLabels: ['Issue #421', 'Repository matches', 'Test results'],
  },
]

export const scenarios: Scenario[] = definitions.map((definition) => ({
  ...definition,
  steps: createSteps(definition),
}))
