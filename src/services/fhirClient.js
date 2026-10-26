// Minimal FHIR R4 REST client built on fetch. No framework dependencies,
// so it can be unit-tested in plain Node.

export class FhirError extends Error {
  constructor(message, { status = 0, url = '', outcome = null } = {}) {
    super(message)
    this.name = 'FhirError'
    this.status = status
    this.url = url
    this.outcome = outcome
  }
}

/** Pull human-readable text out of an OperationOutcome, if the server sent one. */
export function outcomeMessage(outcome) {
  if (!outcome || outcome.resourceType !== 'OperationOutcome') return ''
  return (outcome.issue || [])
    .map((i) => i.diagnostics || i.details?.text || i.code)
    .filter(Boolean)
    .join('; ')
}

/**
 * Normalise any reference form we expect to see to "Type/id".
 * Handles relative ("Patient/1"), absolute ("https://x/fhir/Patient/1")
 * and versioned ("Patient/1/_history/2") references.
 * Returns null for contained ("#id") or urn: references.
 */
export function referenceKey(ref) {
  if (!ref || typeof ref !== 'string') return null
  if (ref.startsWith('#') || ref.startsWith('urn:')) return null
  const clean = ref.split('?')[0].replace(/\/_history\/[^/]+$/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const id = parts[parts.length - 1]
  const type = parts[parts.length - 2]
  if (!/^[A-Z][A-Za-z]+$/.test(type)) return null
  return `${type}/${id}`
}

export function referenceType(ref) {
  const key = referenceKey(ref)
  return key ? key.split('/')[0] : null
}

export class FhirClient {
  /**
   * @param {string} baseUrl FHIR base, e.g. https://server/fhir
   * @param {{ fetchImpl?: typeof fetch, headers?: Record<string,string> }} [opts]
   */
  constructor(baseUrl, opts = {}) {
    if (!baseUrl) throw new FhirError('No FHIR server URL configured')
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl || ((...a) => globalThis.fetch(...a))
    this.headers = { Accept: 'application/fhir+json', ...(opts.headers || {}) }
  }

  /** Build a URL. params is an array of [name, value] pairs so names can repeat. */
  buildUrl(path, params = []) {
    const qs = new URLSearchParams()
    for (const [k, v] of params) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v))
    }
    const query = qs.toString()
    return `${this.baseUrl}/${path}${query ? `?${query}` : ''}`
  }

  async request(url) {
    let res
    try {
      res = await this.fetchImpl(url, { headers: this.headers })
    } catch (err) {
      // fetch rejects on network failure and on CORS blocks; the browser
      // does not tell us which, so say both.
      throw new FhirError(
        `Could not reach the FHIR server (network error or CORS block): ${err.message}`,
        { url },
      )
    }
    let body = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    if (!res.ok) {
      const detail = outcomeMessage(body)
      throw new FhirError(
        `FHIR server returned ${res.status}${detail ? `: ${detail}` : ''}`,
        { status: res.status, url, outcome: body },
      )
    }
    return body
  }

  search(type, params = []) {
    return this.request(this.buildUrl(type, params))
  }

  /** Read by "Type/id" or absolute URL. */
  read(reference) {
    if (/^https?:\/\//i.test(reference)) return this.request(reference)
    const key = referenceKey(reference)
    if (!key) throw new FhirError(`Cannot read reference "${reference}"`)
    return this.request(`${this.baseUrl}/${key}`)
  }

  /** The bundle's "next" paging link, if any. */
  static nextLink(bundle) {
    return bundle?.link?.find((l) => l.relation === 'next')?.url || null
  }

  /**
   * Run a search and follow "next" links up to maxPages.
   * Returns every entry resource plus whether results were cut off.
   */
  async searchAll(type, params = [], { maxPages = 10 } = {}) {
    let bundle = await this.search(type, params)
    const resources = []
    let pages = 0
    for (;;) {
      pages += 1
      for (const e of bundle?.entry || []) {
        if (e.resource) resources.push({ resource: e.resource, mode: e.search?.mode || 'match' })
      }
      const next = FhirClient.nextLink(bundle)
      if (!next) return { resources, truncated: false }
      if (pages >= maxPages) return { resources, truncated: true }
      bundle = await this.request(next)
    }
  }
}
