/**
 * Host half of the Usage Statistics bundle.
 *
 * Folds every committed session log into one aggregate of provider-reported
 * token usage — totals, a per-model breakdown, and a per-day series — and
 * serves it on one exact Fetch route under the authenticated `/api` channel.
 * The Client half reads that route with a document-relative fetch.
 *
 * @module @local/dsh-usage-stats
 */

/** Absolute registration path of the aggregate endpoint. */
const ROUTE_PATH = '/api/usage-stats'

/** How long one computed aggregate is reused before the next scan. */
const DEFAULT_CACHE_MS = 30_000

/** Longest filled day axis; a wider corpus keeps only days that carry usage. */
const MAX_FILLED_DAYS = 200

/** Model series charted individually; every other model folds into one series. */
const MAX_SERIES = 5

export const name = 'usage-stats'

/** The authenticated Fetch channel this route belongs to. */
export const inject = ['connection']

/** Count one non-negative finite number, treating anything else as absent. */
function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** One empty accumulation bucket. */
function emptyBucket() {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  }
}

/**
 * Add one provider usage report to every bucket, in place.
 *
 * `inputTokens` counts input that missed the cache, so a billed prompt is
 * `inputTokens + cacheReadTokens + cacheWriteTokens`; the reported total is
 * preferred when present and recomputed otherwise. That one effective total is
 * returned so callers never repeat the fallback themselves.
 * @param buckets - the accumulators to grow.
 * @param usage - the event's `TokenUsage` record, whose optional keys vary by provider.
 * @returns the total this report contributed.
 */
function accumulate(buckets, usage) {
  const inputTokens = count(usage.inputTokens)
  const outputTokens = count(usage.outputTokens)
  const cacheReadTokens = count(usage.cacheReadTokens)
  const cacheWriteTokens = count(usage.cacheWriteTokens)
  const reported = count(usage.totalTokens)
  const totalTokens = reported > 0 ? reported : inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
  for (const bucket of buckets) {
    bucket.calls += 1
    bucket.inputTokens += inputTokens
    bucket.outputTokens += outputTokens
    bucket.cacheReadTokens += cacheReadTokens
    bucket.cacheWriteTokens += cacheWriteTokens
    bucket.totalTokens += totalTokens
  }
  return totalTokens
}

/** Local-time `YYYY-MM-DD` key of one `Date`. */
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Local-time day key of one epoch-millisecond event time. */
function dayOf(time) {
  const date = new Date(typeof time === 'number' ? time : Number.NaN)
  return Number.isNaN(date.getTime()) ? undefined : dayKey(date)
}

/** Inclusive local-time day keys between two `YYYY-MM-DD` bounds, capped. */
function enumerateDays(from, to) {
  const days = []
  const cursor = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (cursor <= end && days.length <= MAX_FILLED_DAYS) {
    days.push(dayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/**
 * Scan the whole persisted corpus and fold token usage.
 * @param ctx - the composed Host context.
 * @returns the served aggregate payload.
 */
async function collect(ctx) {
  const query = ctx.get('sessionQuery')
  if (query === undefined) throw new Error('the sessionQuery service is not mounted')

  const records = await query.listSessions()
  const totals = emptyBucket()
  const byModel = new Map()
  const byDay = new Map()
  const byModelDay = new Map()
  let unreadable = 0

  for (const record of records) {
    let snapshot
    try {
      snapshot = await query.readSession(record.header.id)
    } catch {
      unreadable += 1
      continue
    }
    for (const event of snapshot.events) {
      if (event === undefined || event === null || event.type !== 'assistant/message') continue
      const usage = event.data?.usage
      if (usage === undefined || usage === null) continue
      const source = event.data?.message?.source ?? {}
      const provider = typeof source.provider === 'string' && source.provider !== '' ? source.provider : 'unknown'
      const model = typeof source.model === 'string' && source.model !== '' ? source.model : 'unknown'
      const key = `${provider}/${model}`

      let modelBucket = byModel.get(key)
      if (modelBucket === undefined) {
        modelBucket = { key, ...emptyBucket() }
        byModel.set(key, modelBucket)
      }

      const day = dayOf(event.time)
      let dayBucket = null
      if (day !== undefined) {
        dayBucket = byDay.get(day)
        if (dayBucket === undefined) {
          dayBucket = emptyBucket()
          byDay.set(day, dayBucket)
        }
      }

      const total = accumulate(dayBucket === null ? [totals, modelBucket] : [totals, modelBucket, dayBucket], usage)
      if (day === undefined) continue

      let modelDay = byModelDay.get(key)
      if (modelDay === undefined) {
        modelDay = new Map()
        byModelDay.set(key, modelDay)
      }
      modelDay.set(day, (modelDay.get(day) ?? 0) + total)
    }
  }

  const models = [...byModel.values()].sort((left, right) => right.totalTokens - left.totalTokens || left.key.localeCompare(right.key))
  const presentDays = [...byDay.keys()].sort()
  const firstDay = presentDays[0]
  const lastDay = presentDays[presentDays.length - 1]
  const filled = firstDay === undefined ? [] : enumerateDays(firstDay, lastDay)
  const days = filled.length <= MAX_FILLED_DAYS ? filled : presentDays

  const series = models.slice(0, MAX_SERIES).map((model) => ({
    key: model.key,
    values: days.map((date) => byModelDay.get(model.key)?.get(date) ?? 0),
  }))
  const rest = models.slice(MAX_SERIES)
  if (rest.length > 0) {
    series.push({
      key: 'other',
      other: true,
      values: days.map((date) => rest.reduce((sum, model) => sum + (byModelDay.get(model.key)?.get(date) ?? 0), 0)),
    })
  }

  return {
    ok: true,
    generatedAt: Date.now(),
    scanned: {
      sessions: records.length,
      unreadableSessions: unreadable,
      firstDay: firstDay ?? null,
      lastDay: lastDay ?? null,
    },
    totals,
    models,
    days: days.map((date) => ({ date, totalTokens: byDay.get(date)?.totalTokens ?? 0 })),
    series,
  }
}

/**
 * Register the aggregate route; every GET answers from one cached scan.
 * @param ctx - owning plugin context.
 */
export function apply(ctx) {
  let cached = null
  let pending = null

  const read = (force) => {
    if (!force && cached !== null && Date.now() - cached.at < DEFAULT_CACHE_MS) return Promise.resolve(cached.value)
    if (pending === null) {
      pending = collect(ctx)
        .then((value) => {
          cached = { at: Date.now(), value }
          return value
        })
        .finally(() => {
          pending = null
        })
    }
    return pending
  }

  ctx.connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const force = new URL(request.url).searchParams.get('refresh') === '1'
      try {
        return Response.json(await read(force), { headers: { 'cache-control': 'no-store' } })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.logger('usage-stats').warn('aggregate failed: %s', message)
        return Response.json({ ok: false, error: message }, { status: 500, headers: { 'cache-control': 'no-store' } })
      }
    },
  })
}
