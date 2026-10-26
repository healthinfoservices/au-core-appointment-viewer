// A tiny in-memory FHIR server for tests. It implements only the search
// behaviour the app relies on, and records every URL requested.

const IHI = 'http://ns.electronichealth.net.au/id/hi/ihi/1.0'
const HPII = 'http://ns.electronichealth.net.au/id/hi/hpii/1.0'

export const fixtures = {
  'Patient/p1': {
    resourceType: 'Patient',
    id: 'p1',
    name: [{ use: 'official', family: 'Citizen', given: ['Jane'], prefix: ['Ms'] }],
    gender: 'female',
    birthDate: '1985-03-21',
    identifier: [{ system: IHI, value: '8003608166690503' }],
  },
  'Patient/p2': {
    resourceType: 'Patient',
    id: 'p2',
    name: [{ use: 'official', family: 'Smith', given: ['Tom'] }],
  },
  'Practitioner/d1': {
    resourceType: 'Practitioner',
    id: 'd1',
    name: [{ family: 'Nguyen', given: ['Anh'], prefix: ['Dr'] }],
    identifier: [{ system: HPII, value: '8003619900015717' }],
  },
  'Practitioner/d2': {
    resourceType: 'Practitioner',
    id: 'd2',
    name: [{ family: 'Brown', given: ['Sam'], prefix: ['Dr'] }],
  },
  'PractitionerRole/r2': {
    resourceType: 'PractitionerRole',
    id: 'r2',
    practitioner: { reference: 'Practitioner/d2' },
    code: [{ text: 'General practitioner' }],
  },
  // Direct Practitioner reference
  'Appointment/a1': {
    resourceType: 'Appointment',
    id: 'a1',
    status: 'booked',
    start: '2026-10-16T09:00:00+10:00',
    end: '2026-10-16T09:15:00+10:00',
    participant: [
      { actor: { reference: 'Patient/p1' }, status: 'accepted' },
      { actor: { reference: 'Practitioner/d1' }, status: 'accepted' },
    ],
  },
  // PractitionerRole reference
  'Appointment/a2': {
    resourceType: 'Appointment',
    id: 'a2',
    status: 'fulfilled',
    start: '2026-10-15T14:00:00+10:00',
    participant: [
      { actor: { reference: 'Patient/p1' }, status: 'accepted' },
      { actor: { reference: 'PractitionerRole/r2' }, status: 'accepted' },
    ],
  },
  'Appointment/a3': {
    resourceType: 'Appointment',
    id: 'a3',
    status: 'booked',
    start: '2026-10-16T08:00:00+10:00',
    participant: [
      { actor: { reference: 'Patient/p2', display: 'Tom Smith' } },
      { actor: { reference: 'PractitionerRole/r2' } },
    ],
  },
}

const nameMatches = (res, term) => {
  const t = term.toLowerCase()
  return (res.name || []).some((n) =>
    [n.family, ...(n.given || []), n.text].filter(Boolean).some((p) => p.toLowerCase().startsWith(t)),
  )
}

const refList = (v) => (v ? v.split(',') : [])
const actorRefs = (a) => (a.participant || []).map((p) => p.actor?.reference)

export function createMockFetch({ rejectIncludes = false, omitIncludes = false } = {}) {
  const calls = []
  const all = () => Object.values(fixtures)

  async function fetchImpl(url) {
    calls.push(url)
    const u = new URL(url)
    const path = u.pathname.replace(/^\/fhir\/?/, '')
    const q = u.searchParams
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

    if (!path.includes('/') || path.split('/').length === 1) {
      const type = path
      if (rejectIncludes && type === 'Appointment' && q.has('_include')) {
        return json(400, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Unsupported _include' }],
        })
      }
      let matches = all().filter((r) => r.resourceType === type)
      if (q.get('name')) matches = matches.filter((r) => nameMatches(r, q.get('name')))
      if (type === 'PractitionerRole' && q.get('practitioner')) {
        const want = refList(q.get('practitioner'))
        matches = matches.filter((r) => want.includes(r.practitioner?.reference))
      }
      if (type === 'Appointment') {
        if (q.get('patient')) {
          const want = refList(q.get('patient'))
          matches = matches.filter((a) => actorRefs(a).some((r) => want.includes(r)))
        }
        if (q.get('actor')) {
          const want = refList(q.get('actor'))
          matches = matches.filter((a) => actorRefs(a).some((r) => want.includes(r)))
        }
        for (const d of q.getAll('date')) {
          const op = d.slice(0, 2)
          const t = new Date(d.slice(2)).getTime()
          matches = matches.filter((a) => {
            const s = new Date(a.start).getTime()
            return op === 'ge' ? s >= t : op === 'lt' ? s < t : true
          })
        }
      }
      const entry = matches.map((resource) => ({ resource, search: { mode: 'match' } }))
      if (type === 'Appointment' && q.has('_include') && !omitIncludes) {
        const keys = new Set(matches.flatMap(actorRefs))
        for (const k of [...keys]) {
          const r = fixtures[k]
          if (r?.resourceType === 'PractitionerRole' && r.practitioner) keys.add(r.practitioner.reference)
        }
        for (const k of keys) if (fixtures[k]) entry.push({ resource: fixtures[k], search: { mode: 'include' } })
      }
      return json(200, { resourceType: 'Bundle', type: 'searchset', entry })
    }

    const r = fixtures[path]
    return r
      ? json(200, r)
      : json(404, { resourceType: 'OperationOutcome', issue: [{ code: 'not-found', diagnostics: `${path} not found` }] })
  }

  return { fetchImpl, calls }
}
