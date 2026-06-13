const handler = require('../api/here-geocode');

const ONTARIO_BBOX = 'bbox:-95.17,41.65,-74.33,56.87';

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

describe('here-geocode handler', () => {
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
    await handler(makeReq({ q: '123 Main St Toronto ON' }), res);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: expect.any(String) });
  });

  test('restricts geocoding to Ontario bounding box', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ items: [] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 Main St Toronto ON' }), res);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain(ONTARIO_BBOX);
  });

  test('does not use countryCode:CAN (bbox is the sole geographic filter)', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ items: [] }) });
    await handler(makeReq({ q: 'test' }), makeRes());
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('countryCode:CAN');
  });

  test('passes HERE geocode items through to client', async () => {
    const mockItems = [{
      title: '123 Main St, Toronto, ON M5V 1A1',
      position: { lat: 43.6441, lng: -79.4006 },
    }];
    global.fetch.mockResolvedValue({ json: async () => ({ items: mockItems }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 Main St Toronto' }), res);
    expect(res._status).toBe(200);
    expect(res._body.items).toEqual(mockItems);
  });

  test('returns empty items when fetch throws', async () => {
    global.fetch.mockRejectedValue(new Error('network error'));
    const res = makeRes();
    await handler(makeReq({ q: '123 Main St' }), res);
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
