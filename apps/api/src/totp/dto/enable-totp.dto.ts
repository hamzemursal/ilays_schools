import { IsString, Length } from "class-validator";

export class EnableTotpDto {
  // The base32 secret returned by /auth/totp/setup — round-tripped by the
  // client rather than kept server-side in a "pending" row, so there's
  // nothing to clean up if the user abandons setup partway through.
  @IsString()
  secret!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
