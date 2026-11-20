import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

type Coordinate = { lat: number; lng: number };

@Injectable()
export class MapsService {
  private readonly key = process.env.GOOGLE_MAPS_SERVER_KEY;

  async autocomplete(input: string, location?: Coordinate) {
    const query = input.trim();
    if (query.length < 3) return [];
    if (location) this.validateCoordinate(location, 'location');
    const key = this.requireKey();
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ['ng'],
        locationBias: {
          circle: {
            center: { latitude: location?.lat ?? 9.0765, longitude: location?.lng ?? 7.3986 },
            radius: 50_000,
          },
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const json = await this.readJson(response);
    const suggestions = (json.suggestions as Array<Record<string, unknown>> | undefined) ?? [];
    return suggestions.flatMap((item) => {
      const prediction = item.placePrediction as { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } | undefined;
      if (!prediction?.placeId || !prediction.text?.text) return [];
      return [{
        placeId: prediction.placeId,
        description: prediction.text.text,
        primaryText: prediction.structuredFormat?.mainText?.text ?? prediction.text.text,
        secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
      }];
    });
  }

  async place(placeId: string) {
    if (!placeId?.trim()) throw new BadRequestException({ code: 'PLACE_ID_REQUIRED', message: 'Choose a location from the search results' });
    const key = this.requireKey();
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,formattedAddress,location,displayName',
      },
      signal: AbortSignal.timeout(5_000),
    });
    const json = await this.readJson(response) as { formattedAddress?: string; location?: { latitude?: number; longitude?: number }; displayName?: { text?: string } };
    if (!json.location || !Number.isFinite(json.location.latitude) || !Number.isFinite(json.location.longitude)) {
      throw new BadGatewayException({ code: 'PLACE_LOCATION_MISSING', message: 'The selected place has no usable location' });
    }
    return {
      placeId,
      address: json.formattedAddress ?? json.displayName?.text ?? 'Selected location',
      lat: json.location.latitude as number,
      lng: json.location.longitude as number,
    };
  }

  async reverse(location: Coordinate) {
    this.validateCoordinate(location, 'location');
    const key = this.requireKey();
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${location.lat},${location.lng}`);
    url.searchParams.set('key', key);
    url.searchParams.set('region', 'ng');
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    const json = await this.readJson(response) as { results?: Array<{ formatted_address?: string; place_id?: string }> };
    const first = json.results?.[0];
    return { lat: location.lat, lng: location.lng, address: first?.formatted_address ?? 'Dropped pin', placeId: first?.place_id ?? null };
  }

  async route(origin: Coordinate, destination: Coordinate) {
    this.validateCoordinate(origin, 'origin');
    this.validateCoordinate(destination, 'destination');
    const fallback = { distanceMeters: this.haversine(origin, destination), durationSeconds: null, points: [origin, destination], source: 'STRAIGHT_LINE' };
    if (!this.key) return fallback;
    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.key,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) return fallback;
      const json = await response.json() as { routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }> };
      const route = json.routes?.[0];
      if (!route) return fallback;
      return {
        distanceMeters: route.distanceMeters ?? fallback.distanceMeters,
        durationSeconds: route.duration ? Math.round(Number.parseFloat(route.duration.replace('s', ''))) : null,
        points: route.polyline?.encodedPolyline ? this.decodePolyline(route.polyline.encodedPolyline) : fallback.points,
        source: 'GOOGLE_ROUTES',
      };
    } catch {
      return fallback;
    }
  }

  private requireKey() {
    if (!this.key) throw new ServiceUnavailableException({ code: 'MAPS_NOT_CONFIGURED', message: 'Location search is temporarily unavailable. Use GPS or enter the address manually.' });
    return this.key;
  }

  private validateCoordinate(value: Coordinate | undefined, field: string) {
    if (!value || !Number.isFinite(value.lat) || !Number.isFinite(value.lng) || value.lat < -90 || value.lat > 90 || value.lng < -180 || value.lng > 180) {
      throw new BadRequestException({ code: 'INVALID_COORDINATE', message: `${field} must contain a valid latitude and longitude` });
    }
  }

  private async readJson(response: Response) {
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new BadGatewayException({ code: 'MAPS_UPSTREAM_ERROR', message: 'Google Maps could not complete this location request' });
    return json;
  }

  private haversine(a: Coordinate, b: Coordinate) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  }

  private decodePolyline(encoded: string) {
    const points: Coordinate[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < encoded.length) {
      const read = () => {
        let result = 0;
        let shift = 0;
        let byte: number;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20 && index <= encoded.length);
        return result & 1 ? ~(result >> 1) : result >> 1;
      };
      lat += read();
      lng += read();
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  }
}
