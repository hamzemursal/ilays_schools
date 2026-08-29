import { IsIn } from "class-validator";

export class ResolveImportRowDto {
  @IsIn(["confirm", "skip"])
  action!: "confirm" | "skip";
}
