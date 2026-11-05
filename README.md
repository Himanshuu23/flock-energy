# Urja Meter API

A small REST API in front of the Urja Meter Ops portal. The portal only has a web UI, so this service logs in to it, calls the same endpoints the pages call, and hands back clean JSON: meters, location, hierarchy, consumption and transformers.

![HTML UI ](public/ui.png)
## Investigation Screenshots

**[Screenshots of Browser DevTools](./docs/investigation/README.md)**

## What it does

| Endpoint | Gives you |
|---|---|
| `GET /api/meters?q=&page=` | A page of meters, with optional search |
| `GET /api/meters/{meterId}` | Nameplate, location and the full hierarchy from zone down to transformer |
| `GET /api/meters/{meterId}/consumption?from=&to=` | Half-hourly readings, with usage per interval worked out |
| `GET /api/transformers?page=` | A page of distribution transformers |
| `GET /health` | Whether this service is up |
| `GET /openapi.json` | The OpenAPI spec |

## How it's laid out

```
src/
  index.js              starts the server
  app.js                builds the express app and mounts routes
  config.js             reads .env
  routes/               one file per resource, only wiring
  controllers/          read the request, call a service, send the response
  services/             the actual logic: calling the portal, cleaning the data
  client/
    portalClient.js     login, session cookie, re-login, retries
    svelteData.js       reads the portal's compact page data format
  middleware/           validation, error handler, 404, request log
  utils/                small helpers (dates, numbers, paging, errors)
docs/                   samples and screenshots from the investigation
```

## Run it

```bash
npm install
cp .env.example .env
```

Open `.env` and put in the portal login:

```
PORT=3000
PORTAL_URL=https://urja-ops.flockenergy.tech
PORTAL_USER=<portal email>
PORTAL_PASS=<portal password>
PORTAL_TZ_OFFSET=+05:30
REQUEST_TIMEOUT_MS=15000
```

Then:

```bash
npm start
```

and the API is at http://localhost:3000.

## A sample request

```bash
curl "http://localhost:3000/api/meters/J100000/consumption?from=2026-06-24T00:00&to=2026-06-24T00:30"
```

```json
{
  "meterId": "J100000",
  "timezone": "+05:30",
  "units": { "kwh": "kWh", "kvah": "kVAh", "voltage": "V" },
  "summary": {
    "count": 2,
    "from": "2026-06-24T00:00:00+05:30",
    "to": "2026-06-24T00:30:00+05:30",
    "totalKwh": 0.84,
    "totalKvah": 0.91
  },
  "quality": { "skippedRows": 0, "duplicateTimestamps": 0, "gaps": 0, "registerDrops": 0 },
  "readings": [
    {
      "timestamp": "2026-06-24T00:00:00+05:30",
      "kwhReading": 48439.16,
      "kvahReading": 52314.29,
      "voltageR": 229,
      "consumptionKwh": 0.42,
      "consumptionKvah": 0.45,
      "intervalMinutes": 30,
      "flags": []
    },
    {
      "timestamp": "2026-06-24T00:30:00+05:30",
      "kwhReading": 48439.58,
      "kvahReading": 52314.75,
      "voltageR": 220,
      "consumptionKwh": 0.42,
      "consumptionKvah": 0.46,
      "intervalMinutes": 30,
      "flags": []
    }
  ]
}
```

```bash
curl http://localhost:3000/api/meters/J100000
```

```json
{
  "id": "J100000",
  "serialNumber": "SE33962",
  "make": "HPL",
  "phaseType": "single",
  "installStatus": "Decommissioned",
  "installType": "Whole Current",
  "location": { "latitude": 26.938961002479868, "longitude": 75.83095696146852 },
  "hierarchy": {
    "zone": { "name": "Jaipur Zone 1", "code": "Z-01" },
    "circle": { "name": "Circle 1", "code": "C-01" },
    "division": { "name": "Division 1", "code": "D-01" },
    "subdivision": { "name": "Subdivision 1", "code": "SD-01" },
    "substation": { "name": "Substation 1", "code": "SS-01" },
    "feeder": { "name": "Feeder 1", "code": "F-001" },
    "transformer": { "name": "Malviya Nagar DT 1", "code": "DT-001" }
  }
}
```

Errors always look the same: `{ "error": "meter_not_found", "message": "Meter J999999 was not found" }`, with 400 for bad input, 404 for a missing meter and 502 when the portal itself fails.

## What I assumed

- **Timestamps are IST.** The portal gives `24/06/2026 00:00` with no zone. The utility is in Jaipur, so I treat it as +05:30 and put that offset in the ISO output. It's a setting (`PORTAL_TZ_OFFSET`) in case that's wrong.
- **`kwh` and `kvah` are cumulative meter registers.** They climb by about 0.4 each half hour, so I treat them as running totals and work out usage from the difference between two readings.
- **The page size is 20.** The portal returns it and I pass it on. I never tried changing it.
- **A meter that doesn't exist gives a 404 from the portal.** I haven't seen that happen, so the code also accepts the SvelteKit error format.
- **Decommissioned and faulty meters stay in the results.** I don't filter anything out. The status is there for callers to filter on.
- **A meter without a location is still a valid meter.** Its `location` is `null`.

## Decisions and trade-offs

- **Raw and derived values both.** For consumption I keep the portal's register readings (`kwhReading`) and add the usage per interval (`consumptionKwh`). Someone might want either one.
- **Bad data is flagged, not hidden.** A missing half hour gets a `gap` flag, a register that goes backwards gets `register_drop` (and no consumption for that interval, since a negative number would be wrong), and the `quality` block counts what was dropped. Rows with unreadable timestamps are skipped and counted. Duplicate timestamps keep the last row.
- **Numbers and dates are converted once, in the service.** The portal sends strings and `DD/MM/YYYY`. The API sends numbers and ISO 8601.
- **One login, shared.** If several requests arrive at once and the session is gone, they wait for a single login instead of each logging in.
- **No cache.** Each call goes to the portal. The portal data for the meter I looked at is months old, and I didn't know what freshness the callers need, so I didn't want to guess a cache lifetime. Meter detail costs two portal calls, which is fine at this size.
- **Express with plain controllers and services.** A little more structure than three routes strictly need, but it's what makes it easy to find things and to test the services without the web layer.

## What I left out on purpose

- **The bulk export.** I found it and worked out the signing (it's written up in `PROTOCOL.md`), but I never saw the response body and never got through the paging, so I wasn't willing to build on it blind. The per-meter endpoints cover everything the task asked for.
- **A network hierarchy tree or index.** The hierarchy for each meter is in the meter detail, but there's no "list everything under this feeder" endpoint. That would mean reading all 403 meters.
- **Caching, rate limiting and authentication on this API.** Anyone who can reach the service can read the data. Fine on a laptop, not fine on a network.

## What I'd do with more time

1. Improve the UI for the HTML client
1. Run the service against the real portal for a lot more meters and write down what odd cases actually show up (missing location, gaps, backwards readings, odd hierarchy strings) instead of only handling the ones I imagined.
2. Add a small cache with a time limit, probably short for the meter list and longer for transformers, and an easy way to force a refresh.
4. Expose the hierarchy as a tree.
5. Put a key or token in front of the API, and add a Dockerfile.

## Reflection

**What assumptions did you make?**
The biggest ones are in the assumptions list above: timestamps are IST, `kwh`/`kvah` are running totals. I also assumed the portal's search text (`q`) works the way the UI box suggests, and that the page size stays at 20. None of those are checked against edge cases, so I made them visible in the code (the timezone is a setting) and in this file.

**Which part was the most difficult, and how did you get unstuck?**
The meter detail data. It isn't in any JSON endpoint, the page loads it from `__data.json` in a format that looks like a jumble of numbers at first. I worked out that every number is a position in the same array, matched it against what the page shows on screen, and then it came apart cleanly. The export signing was the second hard bit. The Network tab only showed that two extra headers existed, so I searched the page's JavaScript for the header name, found the function that builds it, and read exactly what gets signed. Then I hit a browser transport error I couldn't get past, which is why I stopped there.

**If you had another day, what would you improve?**
Real-portal checks across many meters first, then the cache, then the export plus a local index. In that order, because the first one might change what the other two should look like. Also improving the UI a bit so it would be much easier for others to find and test the API.

**What mistake did you make while solving this?**
Two. I went after the export button early, because it looked like the clever part, and spent a good chunk of time on it before I'd built the basic consumption path. I only got the order right after I stopped and asked what the task actually required. The other one was small: when the Transformers page showed "Page 1 of NaN" I first read it as a bug in the data. It was my session expiring after an hour. That's now in `PROTOCOL.md` and it's why the client handles expiry properly.

**If you were reviewing your own submission, what would you criticise?**
Firstly, every meter detail takes two portal calls with no cache. Also the page data reader would fail quietly on shapes I haven't seen. And the API has no authentication, I wrote the bulk export up but didn't use it, so someone who wants the whole dataset still has to make 400+ calls.
