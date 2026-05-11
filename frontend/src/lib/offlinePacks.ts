type PackStatus = 'not-installed' | 'installing' | 'ready' | 'error'
export type PackKind = 'speech' | 'translation' | 'ocr'
export type PackRecord = { id: PackKind; version: string; updatedAt: number; status: PackStatus }

const DB_NAME = 'translator-offline'
const STORE = 'packs'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}

async function run<T>(fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = fn(store)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result as T)
  })
}

export async function getPack(kind: PackKind): Promise<PackRecord | null> {
  return run<PackRecord | null>((store) => store.get(kind)).catch(() => null)
}

export async function listPacks(): Promise<PackRecord[]> {
  return run<PackRecord[]>((store) => store.getAll()).catch(() => [])
}

export async function savePack(record: PackRecord) {
  await run((store) => store.put(record))
}

export async function markInstalling(kind: PackKind) {
  await savePack({ id: kind, version: '1', updatedAt: Date.now(), status: 'installing' })
}

export async function markReady(kind: PackKind) {
  await savePack({ id: kind, version: '1', updatedAt: Date.now(), status: 'ready' })
}

export async function markError(kind: PackKind) {
  await savePack({ id: kind, version: '1', updatedAt: Date.now(), status: 'error' })
}

export async function ensurePack(kind: PackKind, simulateMs = 1200): Promise<PackRecord> {
  const current = await getPack(kind)
  if (current?.status === 'ready') return current
  await markInstalling(kind)
  await new Promise((res) => setTimeout(res, simulateMs))
  await markReady(kind)
  return (await getPack(kind)) as PackRecord
}
