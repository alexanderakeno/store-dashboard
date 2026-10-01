import "server-only";
import { appConfig } from "@/config/app";
import { FixtureSource } from "./fixture/fixtureSource";
import { SheetsSource } from "./sheets/sheetsSource";
import type { DataSource } from "./types";

let source: DataSource | null = null;

/** The single data source for the running app (chosen by DATA_SOURCE). */
export function dataSource(): DataSource {
  if (!source) source = appConfig().dataSource === "fixture" ? new FixtureSource() : new SheetsSource();
  return source;
}

export type * from "./types";
