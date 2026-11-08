import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class EnableMfaDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code: string;
}

export class MfaCodeDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(16)
  code: string;
}

export class VerifyMfaDto {
  @IsNotEmpty()
  @IsString()
  mfaToken: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(16)
  code: string;
}
