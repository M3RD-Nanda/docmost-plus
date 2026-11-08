import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

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
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(16)
  code: string;
}
