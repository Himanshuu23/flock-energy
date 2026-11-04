const { HttpError } = require('../utils/errors');
const { toNumber, round } = require('../utils/numbers');
const { portalToIso } = require('../utils/dates');
const { meterNotFound } = require('./meterService');
const config = require('../config');

const EXPECTED_INTERVAL_MINUTES = 30;

function normaliseRows(rows, offset) {
  const byTimestamp = new Map();
  let skippedRows = 0;

  for (const row of rows) {
    const timestamp = portalToIso(row && row.timestamp, offset);
    if (!timestamp) {
      skippedRows++;
      continue;
    }

    byTimestamp.set(timestamp, {
      timestamp,
      time: Date.parse(timestamp),
      kwhReading: toNumber(row.kwh),
      kvahReading: toNumber(row.kvah),
      voltageR: toNumber(row.voltR)
    });
  }

  const duplicateTimestamps = rows.length - skippedRows - byTimestamp.size;
  const readings = [...byTimestamp.values()].sort((a, b) => a.time - b.time);

  return { readings, skippedRows, duplicateTimestamps };
}

function addConsumption(readings) {
  return readings.map((reading, i) => {
    const previous = readings[i - 1];
    const flags = [];
    let intervalMinutes = null;
    let consumptionKwh = null;
    let consumptionKvah = null;

    if (previous) {
      intervalMinutes = Math.round((reading.time - previous.time) / 60000);
      if (intervalMinutes !== EXPECTED_INTERVAL_MINUTES) flags.push('gap');

      const kwhDiff = difference(previous.kwhReading, reading.kwhReading);
      const kvahDiff = difference(previous.kvahReading, reading.kvahReading);

      if (kwhDiff < 0 || kvahDiff < 0) flags.push('register_drop');
      if (kwhDiff !== null && kwhDiff >= 0) consumptionKwh = kwhDiff;
      if (kvahDiff !== null && kvahDiff >= 0) consumptionKvah = kvahDiff;
    }

    return {
      timestamp: reading.timestamp,
      time: reading.time,
      kwhReading: reading.kwhReading,
      kvahReading: reading.kvahReading,
      voltageR: reading.voltageR,
      consumptionKwh,
      consumptionKvah,
      intervalMinutes,
      flags
    };
  });
}

function difference(before, now) {
  if (before === null || now === null) return null;
  return round(now - before);
}

function sumOf(readings, key) {
  const values = readings.map((r) => r[key]).filter((v) => v !== null);
  return values.length ? round(values.reduce((a, b) => a + b, 0)) : null;
}

async function getConsumption(portal, id, range) {
  const body = await portal
    .getJson(`/portal/meters/${encodeURIComponent(id)}/energy`)
    .catch(meterNotFound(id));

  if (!body || !Array.isArray(body.data)) {
    throw new HttpError(502, 'portal_bad_response', 'The portal returned unexpected consumption data');
  }

  const { readings, skippedRows, duplicateTimestamps } = normaliseRows(body.data, config.timezoneOffset);

  const selected = addConsumption(readings).filter((r) => {
    if (range.from !== null && r.time < range.from) return false;
    if (range.to !== null && r.time > range.to) return false;
    return true;
  });

  const output = selected.map(({ time, ...rest }) => rest);

  return {
    meterId: id,
    timezone: config.timezoneOffset,
    units: { kwh: 'kWh', kvah: 'kVAh', voltage: 'V' },
    summary: {
      count: output.length,
      from: output.length ? output[0].timestamp : null,
      to: output.length ? output[output.length - 1].timestamp : null,
      totalKwh: sumOf(output, 'consumptionKwh'),
      totalKvah: sumOf(output, 'consumptionKvah')
    },
    quality: {
      skippedRows,
      duplicateTimestamps,
      gaps: output.filter((r) => r.flags.includes('gap')).length,
      registerDrops: output.filter((r) => r.flags.includes('register_drop')).length
    },
    readings: output
  };
}

module.exports = { getConsumption, normaliseRows, addConsumption };
