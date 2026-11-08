import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateOidcProviderDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  name: string;

  @IsUrl({ require_protocol: true, protocols: ['https'] })
  issuer: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  clientId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(400)
  clientSecret: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;
}

export class UpdateOidcProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  issuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  clientSecret?: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
