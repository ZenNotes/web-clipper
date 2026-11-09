// The Interpreter answers a template's prompt variables with a model the
// user configured, in one request per clip: the page context plus every
// prompt, answered as one JSON object. Requests go straight from the
// extension to the provider with the user's own key; nothing passes through
// a ZenNotes server.
//
// The extension holds no host access to providers until first use: the
// popup asks for the provider's origin from the click that runs the
// Interpreter (permissionOrigin), because browsers only grant optional
// access from a user gesture.

import type { ModelConfig, ProviderConfig } from '../shared/types'

export interface InterpretInput {
  provider: ProviderConfig
  model: ModelConfig
  context: string
  prompts: string[]
}

export interface BuiltRequest {
  url: string
  init: RequestInit
}

const SYSTEM = [
  'You read a web page and answer questions about it for a note-taking app.',
  'Answer every prompt from the page content. Write plain Markdown unless a prompt asks for another format.',
  'If a prompt asks for a list or structured data, answer with a JSON value of that shape.',
  'If the page does not contain an answer, use an empty string.',
  'Reply with only one JSON object whose keys are the prompt ids, with no code fence and no other text.'
].join(' ')

export function userMessage(context: string, prompts: string[]): string {
  const list = prompts.map((p, i) => `"p${i + 1}": ${JSON.stringify(p)}`).join(',\n')
  return `<page>\n${context}\n</page>\n\nPrompts:\n{\n${list}\n}`
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

/** The origin pattern the browser must allow before the request can go. */
export function permissionOrigin(provider: ProviderConfig): string | null {
  try {
    const u = new URL(endpointBase(provider))
    return `${u.protocol}//${u.hostname}/*`
  } catch {
    return null
  }
}

function endpointBase(p: ProviderConfig): string {
  if (p.baseUrl.trim()) return p.baseUrl.trim()
  switch (p.preset) {
    case 'anthropic':
      return 'https://api.anthropic.com/v1/messages'
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1/chat/completions'
    case 'ollama':
      return 'http://localhost:11434'
    default:
      return ''
  }
}

export function buildRequest(input: InterpretInput): BuiltRequest {
  const { provider: p, model } = input
  const user = userMessage(input.context, input.prompts)
  const base = endpointBase(p)
  const json = (headers: Record<string, string>, body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  switch (p.preset) {
    case 'anthropic':
      return {
        url: base,
        init: json(
          {
            'x-api-key': p.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          {
            model: model.modelId,
            max_tokens: 16000,
            system: SYSTEM,
            messages: [{ role: 'user', content: user }]
          }
        )
      }
    case 'gemini':
      return {
        url: `${trimSlash(base)}/models/${encodeURIComponent(model.modelId)}:generateContent`,
        init: json(
          { 'x-goog-api-key': p.apiKey },
          {
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { responseMimeType: 'application/json' }
          }
        )
      }
    case 'ollama':
      return {
        url: `${trimSlash(base)}/api/chat`,
        init: json(
          {},
          {
            model: model.modelId,
            stream: false,
            format: 'json',
            // Ollama's default 2048-token window silently drops most pages.
            options: { num_ctx: 16384 },
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: user }
            ]
          }
        )
      }
    default: {
      // OpenAI, OpenRouter and custom servers speak chat completions.
      const headers: Record<string, string> = {}
      if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`
      if (p.preset === 'openrouter') headers['x-title'] = 'ZenNotes Web Clipper'
      return {
        url: base,
        init: json(headers, {
          model: model.modelId,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user }
          ]
        })
      }
    }
  }
}

/** The model's text from a provider response body. */
export function responseText(preset: ProviderConfig['preset'], body: unknown): string {
  const b = body as Record<string, any>
  switch (preset) {
    case 'anthropic': {
      if (b?.stop_reason === 'refusal') throw new Error('The model declined this page.')
      const blocks = Array.isArray(b?.content) ? b.content : []
      return blocks
        .filter((x: any) => x?.type === 'text')
        .map((x: any) => x.text)
        .join('')
    }
    case 'gemini':
      return (b?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x?.text ?? '').join('')
    case 'ollama':
      return b?.message?.content ?? ''
    default:
      return b?.choices?.[0]?.message?.content ?? ''
  }
}

/** Reads the JSON answer object, tolerating a code fence or prose around it. */
export function parseAnswers(text: string, prompts: string[]): Map<string, unknown> {
  const answers = new Map<string, unknown>()
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start !== -1 && end > start) t = t.slice(start, end + 1)
  let obj: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(t)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed
  } catch {
    obj = null
  }
  if (!obj) {
    // One prompt and a plain answer: take the text as it is.
    if (prompts.length === 1 && text.trim()) answers.set(prompts[0]!, text.trim())
    return answers
  }
  prompts.forEach((p, i) => {
    const v = obj![`p${i + 1}`] ?? obj![p]
    if (v !== undefined) answers.set(p, typeof v === 'string' ? v : JSON.stringify(v))
  })
  return answers
}

function describeHttpError(status: number, preset: ProviderConfig['preset'], detail: string): string {
  if (status === 401 || status === 403) {
    if (preset === 'ollama') {
      return 'Ollama refused the request. Start it with OLLAMA_ORIGINS set to allow extensions (see Settings, Interpreter).'
    }
    return 'The provider refused the API key.'
  }
  if (status === 404) return 'The provider does not know that model or URL.'
  if (status === 429) return 'The provider is rate limiting. Try again shortly.'
  return `The provider answered ${status}${detail ? `: ${detail.slice(0, 160)}` : ''}.`
}

export async function interpret(
  input: InterpretInput,
  fetchImpl: typeof fetch = fetch
): Promise<Map<string, unknown>> {
  if (!input.prompts.length) return new Map()
  const req = buildRequest(input)
  if (!req.url) throw new Error('The provider has no URL.')
  let res: Response
  try {
    res = await fetchImpl(req.url, req.init)
  } catch {
    throw new Error(
      input.provider.preset === 'ollama'
        ? 'Could not reach Ollama. Is it running?'
        : 'Could not reach the provider.'
    )
  }
  const raw = await res.text()
  if (!res.ok) {
    let detail = raw
    try {
      const j = JSON.parse(raw)
      detail = j?.error?.message ?? j?.error ?? raw
    } catch {
      /* keep the raw text */
    }
    throw new Error(describeHttpError(res.status, input.provider.preset, String(detail)))
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error('The provider sent something that is not JSON.')
  }
  return parseAnswers(responseText(input.provider.preset, body), input.prompts)
}
