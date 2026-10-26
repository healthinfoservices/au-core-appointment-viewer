# Appointment Viewer (Vue 3 + Vuetify 3)

A read-only browser front end for FHIR R4 `Appointment` resources and the
AU Core `Patient`, `Practitioner` and `PractitionerRole` resources they
reference.

- Search by **date** (defaults to today, in the browser's local timezone)
- Search by **patient name**
- Search by **practitioner name**, matching appointments that reference
  either the `Practitioner` directly or one of their `PractitionerRole`s
- Click a row to see appointment details, a patient card and practitioner
  card(s), plus the raw Appointment JSON

## Run it

```bash
npm install
cp .env.example .env      # then set VITE_FHIR_BASE_URL (optional)
npm run dev               # http://localhost:5173
npm test                  # logic tests, Node 18+ (no extra deps)
npm run build             # production bundle in dist/
```

The server URL can also be set or changed from the cog icon in the app; that
value is saved in the browser and overrides `.env`. Use **Test connection**
to check the server's `/metadata` responds.

## Deploy to GitHub Pages

`.github/workflows/deploy-gh-pages.yml` runs on every push to `main` (or
manually from the Actions tab). It runs the tests, builds with
`VITE_BASE=/<repo-name>/`, and force-pushes `dist/` to the `gh-pages` branch.

1. Commit `package-lock.json` (the workflow uses `npm ci`, which needs it).
2. Push to `main`, then wait for the workflow to create `gh-pages`.
3. Repo **Settings → Pages → Build and deployment**: Source "Deploy from a
   branch", branch `gh-pages`, folder `/ (root)`.
4. Optional: set a repository variable `VITE_FHIR_BASE_URL` (Settings →
   Secrets and variables → Actions → Variables) to give the app a default
   server.

The site will be at `https://<owner>.github.io/<repo-name>/`. Notes:

- If the repo is `<owner>.github.io` (a user site) or uses a custom domain,
  the site is served from `/`, so change `VITE_BASE` in the workflow to `/`.
- The page is HTTPS, so browsers block calls to an `http://` FHIR server
  (mixed content). The server also has to allow CORS from `https://<owner>.github.io`.
- The page is public. It contains no data itself, but anyone who opens it
  can query whichever server it points at.

## What has and hasn't been verified

| Part | Status |
|---|---|
| FHIR search, paging, reference resolution, formatters (`src/services`, `src/utils`) | 27 Node tests pass against a mock FHIR server, run in UTC, Brisbane and New York timezones |
| `.vue` components | Script blocks syntax-checked and template tags balance-checked only. **Not compiled or rendered**: the npm registry was blocked in the environment this was written in, so `npm install` / `npm run build` were never run |
| Real FHIR server | **Not tested.** No server URL was available and outbound requests were blocked |
| Dependency versions in `package.json` | Caret ranges I believe are valid and compatible (Vue 3.4+, Vuetify 3.7+, Vite 5, `vite-plugin-vuetify` 2). Not resolved against the registry; newer majors may exist |

Please run `npm install && npm run build` first and report any errors.

## How searching works

Name searches run in two steps rather than using chained parameters
(`Appointment?patient.name=`), because chaining support varies by server and
the PractitionerRole case would need a double chain.

| Search | Requests |
|---|---|
| Patient name | `Patient?name=` → `Appointment?patient=Patient/a,Patient/b…` |
| Practitioner name | `Practitioner?name=` → `PractitionerRole?practitioner=…` → `Appointment?actor=Practitioner/…,PractitionerRole/…` |
| Date | `Appointment?date=ge<day start>&date=lt<next day start>` with explicit UTC offsets, so the server doesn't apply its own timezone |

Appointment queries ask for
`_include=Appointment:patient`, `Appointment:practitioner`, `Appointment:actor`
and `_include:iterate=PractitionerRole:practitioner`. Then:

- If the server rejects the includes with HTTP 400, the query is retried without them.
- Any referenced Patient / Practitioner / PractitionerRole still missing is
  read individually (6 at a time). Failures are listed in the UI instead of
  failing the whole search.
- Reference lists are sent in chunks of 40 to keep URLs short.
- Up to 10 result pages (`_count=50`) are followed per query; the UI warns if
  more existed.

`name` search semantics (prefix, case-insensitive) come from the FHIR string
search rules; exact behaviour depends on the server.

## Things to check against your data

- **Identifier labels.** `src/utils/fhirFormat.js` maps these system URIs,
  written from memory of AU Base / AU Core. Verify them against the IG
  version you built with; unmatched identifiers fall back to their own
  `type` text:
  - IHI `http://ns.electronichealth.net.au/id/hi/ihi/1.0`
  - Medicare number `http://ns.electronichealth.net.au/id/medicare-number`
  - DVA `http://ns.electronichealth.net.au/id/dva`
  - HPI-I `http://ns.electronichealth.net.au/id/hi/hpii/1.0`
  - HPI-O `http://ns.electronichealth.net.au/id/hi/hpio/1.0`
  - Medicare provider number `http://ns.electronichealth.net.au/id/medicare-provider-number`
- **Indigenous status** is read from extension
  `http://hl7.org.au/fhir/StructureDefinition/indigenous-status` (also
  from memory; it just won't show if the URL differs).
- **Appointment fields** shown are standard R4 elements (`appointmentType`,
  `serviceType`, `reasonCode`, `cancelationReason`, etc.). The viewer doesn't
  depend on any AU-specific Appointment profile.
- **CORS.** The browser calls the FHIR server directly, so the server must
  allow cross-origin requests from wherever you host this app. If it doesn't,
  searches fail with a "network error or CORS block" message; a Vite
  `server.proxy` entry is the usual workaround in development.
- **No authentication** is sent, per your answer. `FhirClient` accepts a
  `headers` option if you later need a bearer token.
- **Public test servers** are shared and periodically purged, and their data
  is visible to anyone. Use synthetic data only.

## Layout

```
src/
  services/fhirClient.js        fetch wrapper, errors, paging, reference parsing
  services/appointmentSearch.js search strategies, _include fallback, view model
  utils/fhirFormat.js           names, codes, identifiers, dates, status colours
  utils/viewModel.js            labels for table and cards
  composables/useSettings.js    server URL (.env default, saved in browser)
  components/                   SearchPanel, AppointmentTable, AppointmentDetail,
                                PatientCard, PractitionerCard, InfoList, SettingsDialog
tests/                          node:test suites + in-memory mock FHIR server
```
