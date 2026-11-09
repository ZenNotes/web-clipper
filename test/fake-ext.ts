// A stand-in for the extension API, enough for storage-backed code under
// jsdom. Imported first by the tests that need it, before ext.ts reads it.

const store = new Map<string, unknown>()

const local = {
  async get(keys: string | string[] | null) {
    if (keys === null) return Object.fromEntries(store)
    const list = Array.isArray(keys) ? keys : [keys]
    return Object.fromEntries(list.filter((k) => store.has(k)).map((k) => [k, structuredClone(store.get(k))]))
  },
  async set(items: Record<string, unknown>) {
    for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v))
  },
  async remove(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k)
  }
}

;(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local, onChanged: { addListener() {}, removeListener() {} } },
  runtime: { getURL: (p: string) => `chrome-extension://test/${p}` }
}

export const fakeStore = store
