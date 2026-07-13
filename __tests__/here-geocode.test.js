const handler = require('../api/here-geocode');

// Verified against the real HERE Geocoding API v1 response for
// "15 Basilica Dr, Woodbridge, ON L4H 3G4, Canada" on 2026-07-01.
// Mirrors exactly what geocode.search.hereapi.com/v1/geocode returns.
const FULL_ITEM = {
  title:           '15 Basilica Dr, Woodbridge, ON L4H 3G4, Canada',
  id:              'here:af:streetsection:Dsql5kcmtp4RpjOeRkfPNC:CggIBCCO2tGcARABGgIxNQ',
  resultType:      'houseNumber',
  houseNumberType: 'PA',  // PA = Point Address (exact match); alt: 'interpolated'
  address: {
    label:       '15 Basilica Dr, Woodbridge, ON L4H 3G4, Canada',
    countryCode: 'CAN',
    countryName: 'Canada',
    stateCode:   'ON',        // short province code (e.g. ON, BC, AB)
    state:       'Ontario',
    county:      'York',      // regional municipality
    city:        'Vaughan',   // legal city (may differ from postal city)
    district:    'Woodbridge',// neighbourhood / postal community
    street:      'Basilica Dr',
    postalCode:  'L4H 3G4',
    houseNumber: '15',
  },
  position: { lat: 43.82564, lng: -79.57431 }, // parcel centroid — used by fetchPropData()
  access:   [{ lat: 43.82560, lng: -79.57462 }],// driveway entry point (may differ from position)
  mapView:  { west: -79.57556, south: 43.82474, east: -79.57306, north: 43.82654 },
  scoring: {
    queryScore: 1,           // 0–1 overall match confidence
    fieldScore: {
      country:     1,
      state:       1,
      district:    1,
      streets:     [1],      // per-street match score array
      houseNumber: 1,
      postalCode:  1,
    },
  },
};

// HERE returns interpolated results when it cannot find an exact house-number match.
// Interpolated items have no access array and lower scoring.
const INTERPOLATED_ITEM = {
  title:           '17 Basilica Dr, Woodbridge, ON L4H 3G4, Canada',
  id:              'here:af:streetsection:def456==',
  resultType:      'houseNumber',
  houseNumberType: 'interpolated',
  address: {
    label:       '17 Basilica Dr, Woodbridge, ON L4H 3G4, Canada',
    countryCode: 'CAN',
    countryName: 'Canada',
    stateCode:   'ON',
    state:       'Ontario',
    county:      'York',
    city:        'Vaughan',
    district:    'Woodbridge',
    street:      'Basilica Dr',
    postalCode:  'L4H 3G4',
    houseNumber: '17',
  },
  position: { lat: 43.82570, lng: -79.57445 },
  mapView:  { west: -79.57570, south: 43.82480, east: -79.57320, north: 43.82660 },
  scoring: {
    queryScore: 0.85,
    fieldScore: { country: 1, state: 1, streets: [1], houseNumber: 0.7, postalCode: 1 },
  },
  // no access array — optional field, absent on interpolated results
};

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

// ─── Guard rails ──────────────────────────────────────────────────────────────

describe('here-geocode handler — guard rails', () => {
  test('returns 200 + empty items when q is missing', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ items: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns 500 when HERE_API_KEY is not set', async () => {
    delete process.env.HERE_API_KEY;
    const res = makeRes();
    await handler(makeReq({ q: '123 King St Toronto ON' }), res);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: expect.any(String) });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('handles OPTIONS preflight without calling HERE API', async () => {
    const res = makeRes();
    await handler({ method: 'OPTIONS', query: {} }, res);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res._status).toBe(200);
  });
});

// ─── URL construction ─────────────────────────────────────────────────────────

describe('here-geocode handler — URL construction', () => {
  test('encodes the query string in the HERE request URL', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    await handler(makeReq({ q: '123 King St, Toronto ON' }), makeRes());
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain(encodeURIComponent('123 King St, Toronto ON'));
  });

  test('includes the API key in the HERE request URL', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    await handler(makeReq({ q: 'test' }), makeRes());
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('apiKey=test-key-123');
  });

  test('restricts results to Canada via in=countryCode:CAN', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    await handler(makeReq({ q: '123 Main St Toronto ON' }), makeRes());
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('countryCode:CAN');
  });

  test('does not use bbox — geocode API only supports countryCode for in=', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    await handler(makeReq({ q: 'test' }), makeRes());
    const url = global.fetch.mock.calls[0][0];
    expect(url).not.toContain('bbox');
  });
});

// ─── Response passthrough ─────────────────────────────────────────────────────

describe('here-geocode handler — response passthrough', () => {
  test('passes the full items array through unmodified', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St York ON' }), res);
    expect(res._status).toBe(200);
    expect(res._body.items).toHaveLength(1);
    expect(res._body.items[0]).toEqual(FULL_ITEM);
  });

  test('position.lat and position.lng are present (used by fetchPropData)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    const pos = res._body.items[0].position;
    expect(pos.lat).toBe(43.82564);
    expect(pos.lng).toBe(-79.57431);
  });

  test('address.label passes through (used by hereSelect for geocoding)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    expect(res._body.items[0].address.label).toBe('15 Basilica Dr, Woodbridge, ON L4H 3G4, Canada');
  });

  test('address fields pass through (used by hereShowDd for dropdown display)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    const addr = res._body.items[0].address;
    expect(addr.houseNumber).toBe('15');
    expect(addr.street).toBe('Basilica Dr');
    expect(addr.city).toBe('Vaughan');
    expect(addr.state).toBe('Ontario');
    expect(addr.postalCode).toBe('L4H 3G4');
    expect(addr.countryCode).toBe('CAN');
    expect(addr.countryName).toBe('Canada');
    expect(addr.county).toBe('York');
    expect(addr.district).toBe('Woodbridge');
  });

  test('resultType passes through (houseNumber vs street vs locality)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    expect(res._body.items[0].resultType).toBe('houseNumber');
  });

  test('houseNumberType passes through (PA vs interpolated)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    expect(res._body.items[0].houseNumberType).toBe('PA');
  });

  test('mapView bounding box passes through (west/south/east/north)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    const mv = res._body.items[0].mapView;
    expect(mv.west).toBe(-79.57556);
    expect(mv.south).toBe(43.82474);
    expect(mv.east).toBe(-79.57306);
    expect(mv.north).toBe(43.82654);
  });

  test('access points array passes through (driveway coordinates)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    expect(res._body.items[0].access).toEqual([{ lat: 43.82560, lng: -79.57462 }]);
  });

  test('item id passes through (HERE place identifier)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    expect(res._body.items[0].id).toBe('here:af:streetsection:Dsql5kcmtp4RpjOeRkfPNC:CggIBCCO2tGcARABGgIxNQ');
  });

  test('multiple items pass through (HERE may return several candidates)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM, INTERPOLATED_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    expect(res._body.items).toHaveLength(2);
    expect(res._body.items[1].houseNumberType).toBe('interpolated');
    expect(res._body.items[1].position.lat).toBe(43.82570);
  });

  test('item without access array passes through (access is optional)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [INTERPOLATED_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '125 King St' }), res);
    expect(res._body.items[0].access).toBeUndefined();
    expect(res._body.items[0].position).toBeDefined();
  });
});

// ─── Error / fallback behaviour ───────────────────────────────────────────────

describe('here-geocode handler — error handling', () => {
  test('returns 200 + empty items when fetch throws (network failure)', async () => {
    global.fetch.mockRejectedValue(new Error('network error'));
    const res = makeRes();
    await handler(makeReq({ q: '123 Main St' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ items: [] });
  });

  test('returns 200 + empty items when HERE returns a non-ok HTTP status', async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ title: 'Too Many Requests' }),
    });
    const res = makeRes();
    await handler(makeReq({ q: '123 Main St' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ items: [] });
  });

  test('returns 200 + empty items when HERE returns zero results', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const res = makeRes();
    await handler(makeReq({ q: 'zzz nonexistent address zzz' }), res);
    expect(res._status).toBe(200);
    expect(res._body.items).toHaveLength(0);
  });

  test('does not expose the HERE API key in the response body', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [FULL_ITEM] }) });
    const res = makeRes();
    await handler(makeReq({ q: '123 King St' }), res);
    const bodyStr = JSON.stringify(res._body);
    expect(bodyStr).not.toContain('test-key-123');
  });
});
