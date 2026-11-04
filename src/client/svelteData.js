const { HttpError, SessionExpiredError } = require('../utils/errors');

function hydrate(flat, index) {
  if (typeof index !== 'number' || index < 0) return null;
  const value = flat[index];

  if (Array.isArray(value)) {
    return value.map((item) => hydrate(flat, item));
  }

  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [key, ref] of Object.entries(value)) {
      result[key] = hydrate(flat, ref);
    }
    return result;
  }

  return value === undefined ? null : value;
}

function unflatten(flat) {
  return hydrate(flat, 0);
}

function failureFor(status) {
  if (status === 404) return new HttpError(404, 'not_found', 'The portal has no such page');
  return new HttpError(502, 'portal_error', 'The portal could not load the page');
}

function parsePageResponse(body) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(502, 'portal_bad_response', 'Unexpected page data from the portal');
  }

  if (body.type === 'redirect') throw new SessionExpiredError();
  if (body.type === 'error') throw failureFor(body.status);

  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const errorNode = nodes.find((node) => node && node.type === 'error');
  if (errorNode) throw failureFor(errorNode.status);

  const dataNodes = nodes.filter((node) => node && node.type === 'data' && Array.isArray(node.data));
  if (dataNodes.length === 0) {
    throw new HttpError(502, 'portal_bad_response', 'The portal page came back without any data');
  }

  return unflatten(dataNodes[dataNodes.length - 1].data);
}

module.exports = { unflatten, parsePageResponse };
