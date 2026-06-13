const handler = require('../api/get-property');

// A 5-node closed polygon near Toronto (~25m x 15m, ≈375 sq m ≈ 4038 sq ft)
const HOUSE_POLYGON = [
  { lat: 43.7000, lon: -79.4000 },
  { lat: 43.7002, lon: -79.4000 },
  { lat: 43.7002, lon: -79.3998 },
  { lat: 43.7000, lon: -79.3998 },
  { lat: 43.7000, lon: -79.4000 },
];

const GARAGE_POLYGON = [
  { lat: 43.6999, lon: -79.4000 },
  { lat: 43.7000, lon: -79.4000 },
  { lat: 43.7000, lon: -79.3999 },
  { lat: 43.6999, lon: -79.3999 },
  { lat: 43.6999, lon: -79.4000 },
];

function overpassResponse(ways) {
  return { elements: ways };
}

function makeWay(id, tags, geometry) {
  return { type: 'way', id, tags, geometry };
}

function makeReq(body = {}) {
  return { method: 'POST', body };
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
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('get-property handler', () => {
  test('returns nulls when lat is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ lng: -79.4 }), res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ footprintSqFt: null, perimeterFt: null, polygon: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns nulls when lng is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ lat: 43.7 }), res);
    expect(res._body).toMatchObject({ footprintSqFt: null, perimeterFt: null, polygon: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('uses out geom qt query format (single-pass, no node expansion)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), makeRes());
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('out%20geom%20qt');
  });

  test('uses 30m search radius', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), makeRes());
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('around%3A30');
  });

  test('returns not-found when Overpass returns no buildings', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body).toMatchObject({ footprintSqFt: null, source: 'not-found' });
  });

  test('classifies building=house as Main Building', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([makeWay(1, { building: 'house' }, HOUSE_POLYGON)]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body.buildings[0].label).toBe('Main Building');
  });

  test('classifies building=yes as Main Building', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([makeWay(1, { building: 'yes' }, HOUSE_POLYGON)]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body.buildings[0].label).toBe('Main Building');
  });

  test('classifies building=garage as Garage / Outbuilding', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([makeWay(1, { building: 'garage' }, GARAGE_POLYGON)]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body.buildings[0].label).toBe('Garage / Outbuilding');
  });

  test('classifies building=shed as Garage / Outbuilding', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([makeWay(1, { building: 'shed' }, GARAGE_POLYGON)]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body.buildings[0].label).toBe('Garage / Outbuilding');
  });

  test('sorts main building before garage in results', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([
        makeWay(1, { building: 'garage' }, GARAGE_POLYGON),
        makeWay(2, { building: 'house' },  HOUSE_POLYGON),
      ]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body.buildings[0].label).toBe('Main Building');
    expect(res._body.buildings[1].label).toBe('Garage / Outbuilding');
  });

  test('totals footprint and perimeter across all buildings', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([
        makeWay(1, { building: 'house' },  HOUSE_POLYGON),
        makeWay(2, { building: 'garage' }, GARAGE_POLYGON),
      ]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    const { buildings, footprintSqFt, perimeterFt } = res._body;
    const expectedFootprint = buildings.reduce((s, b) => s + b.footprintSqFt, 0);
    const expectedPerim     = buildings.reduce((s, b) => s + b.perimeterFt,   0);
    expect(footprintSqFt).toBe(expectedFootprint);
    expect(perimeterFt).toBe(expectedPerim);
  });

  test('polygon in response is the main building polygon', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([
        makeWay(1, { building: 'house' },  HOUSE_POLYGON),
        makeWay(2, { building: 'garage' }, GARAGE_POLYGON),
      ]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    // polygon should match the main building (first in sorted list)
    expect(res._body.polygon).toEqual(res._body.buildings[0].polygon);
  });

  test('computed footprintSqFt is a positive number', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([makeWay(1, { building: 'house' }, HOUSE_POLYGON)]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body.footprintSqFt).toBeGreaterThan(0);
  });

  test('computed perimeterFt is a positive number', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => overpassResponse([makeWay(1, { building: 'house' }, HOUSE_POLYGON)]),
    });
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body.perimeterFt).toBeGreaterThan(0);
  });

  test('returns error source on Overpass failure', async () => {
    global.fetch.mockRejectedValue(new Error('Overpass timeout'));
    const res = makeRes();
    await handler(makeReq({ lat: 43.7, lng: -79.4 }), res);
    expect(res._body).toMatchObject({ footprintSqFt: null, source: 'error' });
  });

  test('rejects non-POST requests with 405', async () => {
    const res = makeRes();
    await handler({ method: 'GET', body: {} }, res);
    expect(res._status).toBe(405);
  });
});
