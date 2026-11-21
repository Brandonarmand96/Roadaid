import { ServiceUnavailableException } from '@nestjs/common';
import { MapsService } from '../src/maps/maps.service';

describe('MapsService', () => {
  const previousKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  const previousProvider = process.env.MAPS_PROVIDER;
  const previousMapboxKey = process.env.MAPBOX_ACCESS_TOKEN;
  afterEach(() => {
    process.env.GOOGLE_MAPS_SERVER_KEY = previousKey;
    process.env.MAPS_PROVIDER = previousProvider;
    process.env.MAPBOX_ACCESS_TOKEN = previousMapboxKey;
  });

  it('returns no suggestions for a query shorter than three characters without calling Google', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    const service = new MapsService();
    await expect(service.autocomplete('ab')).resolves.toEqual([]);
  });

  it('maps Mapbox autocomplete features into the existing client contract', async () => {
    process.env.MAPS_PROVIDER = 'mapbox';
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      features: [{ id: 'place.1', text: 'Wuse 2', place_name: 'Wuse 2, Abuja, Nigeria' }],
    }), { status: 200 }));
    const service = new MapsService();
    await expect(service.autocomplete('Wuse')).resolves.toEqual([{
      placeId: 'place.1', description: 'Wuse 2, Abuja, Nigeria', primaryText: 'Wuse 2', secondaryText: 'Abuja, Nigeria',
    }]);
    expect(fetchSpy.mock.calls[0][0].toString()).toContain('api.mapbox.com');
    fetchSpy.mockRestore();
  });

  it('fails clearly when search is requested without a server key', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    const service = new MapsService();
    await expect(service.autocomplete('Wuse')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses a deterministic straight-line route when Google Routes is not configured', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    const service = new MapsService();
    const route = await service.route({ lat: 9.0765, lng: 7.3986 }, { lat: 9.0865, lng: 7.3986 });
    expect(route.source).toBe('STRAIGHT_LINE');
    expect(route.distanceMeters).toBeGreaterThan(1_000);
    expect(route.points).toHaveLength(2);
  });
});
