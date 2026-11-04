const { HttpError } = require('../utils/errors');
const { toNumber } = require('../utils/numbers');
const { buildPagination } = require('../utils/pagination');

const LEVELS = {
  Zone: 'zone',
  Circle: 'circle',
  Division: 'division',
  Subdivision: 'subdivision',
  'Sub Station': 'substation',
  Feeder: 'feeder',
  DT: 'transformer'
};

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toMeterSummary(row) {
  return {
    id: clean(row.meterId),
    serialNumber: clean(row.serialNo),
    make: clean(row.make),
    phaseType: clean(row.phaseType),
    installStatus: clean(row.installStatus),
    transformerCode: clean(row.dtCode)
  };
}

function splitNameAndCode(text) {
  const value = clean(text);
  if (!value) return null;
  const match = value.match(/^(.*?)\s*\(([^()]*)\)$/);
  if (!match) return { name: value, code: null };
  return { name: match[1].trim() || null, code: match[2].trim() || null };
}

function parseHierarchy(raw) {
  const hierarchy = {};
  for (const [portalKey, key] of Object.entries(LEVELS)) {
    hierarchy[key] = splitNameAndCode(raw ? raw[portalKey] : null);
  }
  return hierarchy;
}

function parseLocation(geo) {
  const latitude = toNumber(geo && geo.latitude);
  const longitude = toNumber(geo && geo.longitude);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function meterNotFound(id) {
  return (err) => {
    if (err instanceof HttpError && err.status === 404) {
      throw new HttpError(404, 'meter_not_found', `Meter ${id} was not found`);
    }
    throw err;
  };
}

async function listMeters(portal, { search, page }) {
  const query = new URLSearchParams({ q: search, page: String(page) });
  const body = await portal.getJson(`/portal/meters/search?${query}`);
  const rows = Array.isArray(body.data) ? body.data : [];

  return {
    data: rows.map(toMeterSummary),
    pagination: buildPagination(page, body.pageSize, body.total)
  };
}

async function getMeter(portal, id) {
  const encoded = encodeURIComponent(id);

  const [pageData, geo] = await Promise.all([
    portal.getPageData(`/meters/${encoded}/__data.json?x-sveltekit-invalidated=001`).catch(meterNotFound(id)),
    portal.getJson(`/portal/meters/${encoded}/geo`).then((body) => body.data).catch((err) => {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    })
  ]);

  if (!pageData || !Array.isArray(pageData.detail && pageData.detail.data)) {
    throw new HttpError(404, 'meter_not_found', `Meter ${id} was not found`);
  }

  const nameplate = {};
  for (const row of pageData.detail.data) {
    if (row && row.parameterName) nameplate[row.parameterName] = row.parameterValue;
  }

  const rawHierarchy = pageData.hierarchy || {};

  return {
    id: clean(nameplate['Meter ID']) || clean(pageData.meterId) || id,
    serialNumber: clean(nameplate['Serial No']),
    make: clean(nameplate.Make),
    phaseType: clean(nameplate['Phase Type']),
    installStatus: clean(nameplate['Installation Status']) || clean(rawHierarchy['Installation Status']),
    installType: clean(nameplate['Installation Type']) || clean(rawHierarchy['Installation Type']),
    location: parseLocation(geo),
    hierarchy: parseHierarchy(rawHierarchy)
  };
}

module.exports = { listMeters, getMeter, meterNotFound, splitNameAndCode, parseHierarchy };
