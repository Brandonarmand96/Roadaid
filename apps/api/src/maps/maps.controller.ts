import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@roadaid/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { MapsService } from './maps.service';

type Coordinate = { lat: number; lng: number };

@Controller('maps')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.PROVIDER)
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  @Post('autocomplete')
  autocomplete(@Body() body: { input?: string; location?: Coordinate }) {
    return this.maps.autocomplete(body.input ?? '', body.location);
  }

  @Post('place')
  place(@Body('placeId') placeId: string) {
    return this.maps.place(placeId);
  }

  @Post('reverse')
  reverse(@Body() location: Coordinate) {
    return this.maps.reverse(location);
  }

  @Post('route')
  route(@Body() body: { origin: Coordinate; destination: Coordinate }) {
    return this.maps.route(body.origin, body.destination);
  }
}
