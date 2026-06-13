const handler = require('../api/here-autocomplete');

const ONTARIO_BBOX = 'bbox:-95.17,41.65,-74.33,56.87';
const GTA_BIAS     = 'at=43.70,-79.40';

function makeReq(query = {}) {
  return { method: 'GET', query };
}

function makeRes() {
  const res = {
    _status: null, _body: null,
    status(c) { this._status = c; return this; },
    json(b)   { this._body  = b; return this; },
    end()     { return this; },
    setHeader() {},
  };
  return res;
}

beforeEach(() => {
  process.env.HERE_API_KEY = 'test-key-123';
  global.fetch = jest.fn();
});

afterEach(() => {
  delete process.env.HERE_API_KEY;
  jest.resetAllMocks();
});

describe('here-autocomplete handler', () => {
  test('returns empty items when q is missing', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ items: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns 500 when HERE_API_KEY is not configured', async () => {
    delete process.env.HERE_API_KEY;
    const res = makeRes();
    await handler(makeReq({ q: '123 Main St' }), res);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: expect.any(String) });
  });

  test('restricts results to Ontario bounding box', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ items: [] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 Main St Toronto' }), res);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain(ONTARIO_BBOX);
  });

  test('does not search outside Ontario (no countryCode:CAN fallback)', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ items: [] }) });
    await handler(makeReq({ q: 'test' }), makeRes());
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('countryCode:CAN');
  });

  test('does not include at= (mutually exclusive with in=bbox per HERE API)', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ items: [] }) });
    await handler(makeReq({ q: 'King St' }), makeRes());
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('at=');
  });

  test('limits suggestions to 5 results', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ items: [] }) });
    await handler(makeReq({ q: 'Main' }), makeRes());
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('limit=5');
  });

  test('passes HERE response items through to client', async () => {
    const mockItems = [
      { title: '123 Main St, Toronto, ON', position: { lat: 43.7, lng: -79.4 } },
      { title: '456 Main St, Brampton, ON', position: { lat: 43.6, lng: -79.7 } },
    ];
    global.fetch.mockResolvedValue({ json: async () => ({ items: mockItems }) });
    const res = makeRes();
    await handler(makeReq({ q: 'Main St' }), res);
    expect(res._status).toBe(200);
    expect(res._body.items).toEqual(mockItems);
  });

  test('returns empty items when fetch throws', async () => {
    global.fetch.mockRejectedValue(new Error('network error'));
    const res = makeRes();
    await handler(makeReq({ q: '123 Main' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ items: [] });
  });

  test('handles OPTIONS preflight without calling HERE API', async () => {
    const req = { method: 'OPTIONS', query: {} };
    const res = makeRes();
    await handler(req, res);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res._status).toBe(200);
  });
});
