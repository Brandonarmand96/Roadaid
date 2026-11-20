import { ServiceUnavailableException } from '@nestjs/common';
import { MapsService } from '../src/maps/maps.service';

describe('MapsService', () => {
  const previousKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  afterEach(() => { process.env.GOOGLE_MAPS_SERVER_KEY = previousKey; });

  it('returns no suggestions for a query shorter than three characters without calling Google', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    const service = new MapsService();
    await expect(service.autocomplete('ab')).resolves.toEqual([]);
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
