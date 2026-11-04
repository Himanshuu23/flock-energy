# How the Urja Meter Ops portal works

This is what I found by using the portal in a browser with the DevTools Network tab open. I only used the pages and buttons a normal logged-in user has, and sent read requests and through network tab, responses, headers found the info about this app.

Screenshots of what I saw are listed in [`docs/investigation/`](docs/investigation/README.md)

## The short version

- The portal is a SvelteKit app at `https://urja-ops.flockenergy.tech`.
- You log in with a form post and get a session cookie that lasts one hour.
- Most data comes from small JSON endpoints under `/portal`.
- Meter details (nameplate and hierarchy) are NOT under `/portal`. They only come from the page's own data route, `/meters/{id}/__data.json`
- There is also an "Export all meters" button on the Transformers page that calls a signed bulk endpoint. I worked out how the signing works but didn't use it (see the end).

## Authentication

`POST /login` with a form body (`application/x-www-form-urlencoded`):

| Field | Value |
|---|---|
| `email` | the portal user email |
| `password` | the portal password |

The browser sends this with `fetch`, and the response is HTTP 200 with a JSON body:

```json
{"type":"redirect","status":303,"location":"/meters"}
```

So the 303 is inside the body, not the HTTP status. I searched about that and found out that its SvelteKit's format for form actions. The cookie comes back in `Set-Cookie`:

```
__Secure-better-auth.session_token=<value>; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax
```

From then on every request only needs that cookie. I didn't see any API key or other header on normal requests.

Things I noticed:

- The session lasts **3600 seconds**. I came back to the Transformers page about an hour after logging in and the call failed with `401` and `{"error":"unauthorized","message":"A valid session is required."}`. The page showed "Page 1 of NaN" because it tried to read a total from that error response. That looked like a data bug at first, it was just the expired session.
- SvelteKit normally rejects form posts from another origin, so my client sends the portal's own origin in the `Origin` header on the login post. I also send `Accept: application/json` and `x-sveltekit-action: true` (what SvelteKit's own form handling sends) so the answer is the JSON above and not a plain redirect. (I haven't worked with Svelt earlier ever, i found this information through web)

## Endpoints (Responses are copy-pasted from server responses)

### `GET /portal/meters/search?q=&page=1`

The meter list. This is what the Meters page calls.

```json
{
  "data": [
    { "meterId": "J100000", "serialNo": "SE33962", "make": "HPL", "phaseType": "single", "installStatus": "Decommissioned", "dtCode": "DT-001" }
  ],
  "total": 403,
  "page": 1,
  "pageSize": 20
}
```

403 meters, 20 per page, 21 pages (the UI says "Page 1 of 21"). The UI search box fills `q` ("Search by meter number or serial"). The list has fewer fields than the detail page, for example no installation type, no location, no hierarchy.

### `GET /portal/meters/{meterId}/geo`

```json
{"data":{"latitude":"26.938961002479868","longitude":"75.83095696146852"}}
```

### `GET /portal/meters/{meterId}/energy`

```json
{
  "data": [
    { "timestamp": "23/06/2026 23:30", "kwh": "48438.74", "kvah": "52313.84", "voltR": "226" }
  ]
}
```

No query parameters, no paging, no `total`. For J100000 it returned everything from 23/06/2026 23:30 to 30/06/2026 23:30 in half-hour steps.

### `GET /portal/dts?page=1`

The Transformers page.

```json
{
  "data": [
    { "code": "DT-001", "name": "Malviya Nagar DT 1", "feederCode": "F-001", "capacityKva": 100 }
  ]
}
```

The page code works out the page count as `ceil(total / 20)`, so the response has a `total` and the page size is 20.

### `GET /meters/{meterId}/__data.json?x-sveltekit-invalidated=001`

This is the page route for a meter, not part of `/portal/`. The browser fetches it when you open a meter. It carries the nameplate and the hierarchy.

Decoded, J100000 looks like this:

```json
{
  "meterId": "J100000",
  "detail": {
    "data": [
      { "parameterName": "Meter ID", "parameterValue": "J100000" },
      { "parameterName": "Serial No", "parameterValue": "SE33962" },
      { "parameterName": "Make", "parameterValue": "HPL" },
      { "parameterName": "Phase Type", "parameterValue": "single" },
      { "parameterName": "Installation Status", "parameterValue": "Decommissioned" },
      { "parameterName": "Installation Type", "parameterValue": "Whole Current" }
    ]
  },
  "hierarchy": {
    "Meter ID": "J100000",
    "Installation Status": "Decommissioned",
    "Installation Type": "Whole Current",
    "Zone": "Jaipur Zone 1 (Z-01)",
    "Circle": "Circle 1 (C-01)",
    "Division": "Division 1 (D-01)",
    "Subdivision": "Subdivision 1 (SD-01)",
    "Sub Station": "Substation 1 (SS-01)",
    "Feeder": "Feeder 1 (F-001)",
    "DT": "Malviya Nagar DT 1 (DT-001)"
  }
}
```

I never saw this route with an expired session. SvelteKit normally answers a page-data request with a `{"type":"redirect", ...}` body when the user has to log in again, so the client treats a redirect there like a 401.

## Quirks and surprises

2. For a **meter id that doesn't exists**, `/meters/{id}/__data.json` answers with a data response whose last node is `{"type":"error","error":{"message":"Meter not found"}, "status":404}`.
1. **Two kinds of endpoint.** Lists, location and energy are plain JSON under `/portal/`. Details and hierarchy exist only as SvelteKit page data.
2. **Numbers are strings** in `geo` and `energy` (`"26.93..."`, `"48438.74"`, `"226"`), but `capacityKva` is a real number and `total`/`page`/`pageSize` are numbers too.
3. **Timestamps** are `DD/MM/YYYY HH:mm` with no timezone and no seconds. The utility is in Jaipur so I treat them as IST.
4. **`kwh` and `kvah` are cumulative register readings**, not usage per interval. They go up by roughly 0.4 each half hour. Actual usage is the difference between two readings.
5. **The nameplate is a list of name/value rows**, not an object. That explains why the detail page has "Installation Type" and the list doesn't.
6. **Names and codes are glued together** in one string: `"Malviya Nagar DT 1 (DT-001)"`.
7. **The hierarchy block repeats** Meter ID, Installation Status and Installation Type from the nameplate.
8. **A decommissioned meter still reports data.** J100000 is "Decommissioned" and still has readings.
9. **The data is old.** The newest reading for J100000 is 30/06/2026 23:30, but I was looking at it in November 2026. So the portal isn't showing live data.
10. **Serial numbers are not always in one pattern**: `SE33962`, `GE84132`, `AL28136`, `L&84997`. I leave them as they are.
11. On the first page of the lists each meter has its own DT (`DT-001` for the first meter, `DT-002` for the second, and so on) and each DT has its own feeder (`F-001`, `F-002`). I only looked at the first page so I can't say if that holds for all 403.
12. **The portal hands out a signing secret.** `GET /portal/keys` returns `{"data":{"signingSecret":"..."}}` to any logged-in session. I'm only noting that, I didn't do anything with it beyond what the export button does.

## The export button (bulk path)

The Transformers page has an "Export all meters" button. Clicking it makes two requests:

1. `GET /portal/keys` returns the `signingSecret`.
2. `GET /portal/export?page=1` with two extra headers, `x-timestamp` and `x-signature`.

I found how the signature is built by searching the page's JavaScript (Sources tab) for `x-signature`:

- `x-timestamp` is the current Unix time in seconds, as a string.
- The string to sign is `METHOD`, `PATH`, `QUERY` and the timestamp joined with newline characters, for example `GET\n/portal/export\npage=1\n1793706494`. The path has no query string, and the query has no leading `?`.
- `x-signature` is HMAC-SHA256 of that string with the `signingSecret` as the key, written as lowercase hex (64 characters).

The response is JSON, about 230 kB for `page=1`, and the page saves its `data` property as a file. The UI only ever asks for `page=1`.

What I **didn't** find out: the shape of the export body (DevTools wouldn't show it, and when I re-ran the call from the console Chrome failed with `net::ERR_QUIC_PROTOCOL_ERROR` even though the server had answered 200), whether there are more pages, and how much clock difference the server accepts on the timestamp. Because of that, the API in this repo does not use the export.

## Things I didn't check

- What `q` does with partial matches or other fields.
- Whether the list takes a bigger page size.
- What `geo` and `energy` return for a meter that has no location or no readings, and whether readings ever have gaps or go backwards on other meters. The API handles all of these, but I haven't seen them on the real portal.
