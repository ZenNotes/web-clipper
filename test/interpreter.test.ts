import { describe, expect, it } from 'vitest'
import { buildRequest, interpret, parseAnswers, permissionOrigin, responseText } from '../src/interpreter/interpreter'
import { newProvider } from '../src/shared/defaults'
import { interpreterAccess, refusalMessage } from '../src/interpreter/access'
import type { ModelConfig, ProviderPreset } from '../src/shared/types'

const model = (modelId: string): ModelConfig => ({ id: 'm', providerId: 'p', name: 'M', modelId })
const provider = (preset: ProviderPreset, apiKey = 'k-123') => ({ ...newProvider(preset), apiKey })

describe('requests', () => {
  it('builds an Anthropic Messages request for the browser', () => {
    const req = buildRequest({ provider: provider('anthropic'), model: model('claude-haiku-5-5'), context: 'Page', prompts: ['a summary'] })
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    const h = req.init.headers as Record<string, string>
    expect(h['x-api-key']).toBe('k-123')
    expect(h['anthropic-version']).toBe('2023-06-01')
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true')
    const body = JSON.parse(req.init.body as string)
    expect(body.model).toBe('claude-haiku-5-5')
    expect(body.messages[0].content).toContain('"p1": "a summary"')
    expect(body.temperature).toBeUndefined()
  })

  it('builds OpenAI-style, Gemini and Ollama requests', () => {
    const o = buildRequest({ provider: provider('openai'), model: model('gpt-5-mini'), context: 'x', prompts: ['q'] })
    expect(o.url).toBe('https://api.openai.com/v1/chat/completions')
    expect((o.init.headers as Record<string, string>).authorization).toBe('Bearer k-123')
    const g = buildRequest({ provider: provider('gemini'), model: model('gemini-2.5-flash'), context: 'x', prompts: ['q'] })
    expect(g.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect((g.init.headers as Record<string, string>)['x-goog-api-key']).toBe('k-123')
    const l = buildRequest({ provider: provider('ollama', ''), model: model('llama3.2'), context: 'x', prompts: ['q'] })
    expect(l.url).toBe('http://localhost:11434/api/chat')
    expect(JSON.parse(l.init.body as string).options.num_ctx).toBeGreaterThan(2048)
    const c = buildRequest({
      provider: { ...provider('custom', ''), baseUrl: 'https://llm.local:8443/v1/chat/completions' },
      model: model('my-model'),
      context: 'x',
      prompts: ['q']
    })
    expect(c.url).toBe('https://llm.local:8443/v1/chat/completions')
    expect((c.init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('names the origin to ask access for', () => {
    expect(permissionOrigin(provider('anthropic'))).toBe('https://api.anthropic.com/*')
    expect(permissionOrigin(provider('ollama'))).toBe('http://localhost/*')
    expect(permissionOrigin({ ...provider('custom'), baseUrl: 'not a url' })).toBeNull()
  })
})

describe('answers', () => {
  it('reads each provider shape', () => {
    expect(responseText('anthropic', { content: [{ type: 'text', text: '{"p1":"x"}' }] })).toBe('{"p1":"x"}')
    expect(() => responseText('anthropic', { stop_reason: 'refusal', content: [] })).toThrow(/declined/)
    expect(responseText('openai', { choices: [{ message: { content: 'y' } }] })).toBe('y')
    expect(responseText('gemini', { candidates: [{ content: { parts: [{ text: 'z' }] } }] })).toBe('z')
    expect(responseText('ollama', { message: { content: 'w' } })).toBe('w')
  })

  it('parses the answer object, fenced or not, keeping structured answers as JSON', () => {
    const a = parseAnswers('```json\n{"p1": "A summary.", "p2": ["x", "y"]}\n```', ['sum', 'tags'])
    expect(a.get('sum')).toBe('A summary.')
    expect(a.get('tags')).toBe('["x","y"]')
    expect(parseAnswers('Plain answer', ['only']).get('only')).toBe('Plain answer')
  })

  it('runs end to end against a fake provider', async () => {
    const calls: string[] = []
    const fakeFetch = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"p1":"Short."}' }] }), { status: 200 })
    }) as unknown as typeof fetch
    const answers = await interpret(
      { provider: provider('anthropic'), model: model('claude-haiku-5-5'), context: 'Page', prompts: ['a summary'] },
      fakeFetch
    )
    expect(calls).toEqual(['https://api.anthropic.com/v1/messages'])
    expect(answers.get('a summary')).toBe('Short.')
  })

  it('explains provider errors', async () => {
    const f = (status: number) => (async () => new Response('{"error":{"message":"nope"}}', { status })) as unknown as typeof fetch
    const input = { provider: provider('openai'), model: model('x'), context: '', prompts: ['q'] }
    await expect(interpret(input, f(401))).rejects.toThrow(/API key/)
    await expect(interpret({ ...input, provider: provider('ollama', '') }, f(403))).rejects.toThrow(/OLLAMA_ORIGINS/)
    await expect(interpret(input, f(500))).rejects.toThrow(/500: nope/)
  })
})

describe('access before the Interpreter runs', () => {
  it('asks Firefox for website content consent with the provider access, in one request', () => {
    expect(interpreterAccess('https://api.anthropic.com/*', 'firefox')).toEqual({
      origins: ['https://api.anthropic.com/*'],
      data_collection: ['websiteContent']
    })
    expect(interpreterAccess('https://api.anthropic.com/*', 'chrome')).toEqual({ origins: ['https://api.anthropic.com/*'] })
    expect(interpreterAccess('https://api.anthropic.com/*', 'safari')).toEqual({ origins: ['https://api.anthropic.com/*'] })
  })

  it('says in one line why it did not run', () => {
    expect(refusalMessage('Anthropic', 'https://api.anthropic.com/*', 'firefox')).toBe(
      'The Interpreter needs your OK to send this page to Anthropic.'
    )
    expect(refusalMessage('Anthropic', 'https://api.anthropic.com/*', 'chrome')).toBe(
      'The clipper needs access to https://api.anthropic.com/* to run the Interpreter.'
    )
  })
})
