const PORTAL_FORMAT = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_NO_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function portalToIso(text, offset) {
  if (typeof text !== 'string') return null;
  const match = PORTAL_FORMAT.exec(text.trim());
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00${offset}`;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const back = new Date(time + offsetToMinutes(offset) * 60000).toISOString();
  if (back.slice(0, 16) !== `${year}-${month}-${day}T${hour}:${minute}`) return null;
  return iso;
}

function offsetToMinutes(offset) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function parseBoundary(text, offset, endOfDay = false) {
  let value = text.trim();
  if (DATE_ONLY.test(value)) {
    value = `${value}T${endOfDay ? '23:59:59' : '00:00:00'}${offset}`;
  } else if (DATE_TIME_NO_ZONE.test(value)) {
    value = `${value.length === 16 ? `${value}:00` : value}${offset}`;
  }
  return Date.parse(value);
}

module.exports = { portalToIso, parseBoundary };
