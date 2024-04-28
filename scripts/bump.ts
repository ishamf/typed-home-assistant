// @deno-types="npm:@types/semver@^7"
import { inc } from "npm:semver@7.6.0";

const type = Deno.args[0];

if (type !== "patch" && type !== "minor" && type !== "major") {
  throw new Error("Invalid type, must be one of patch, minor, major");
}

const currentJson = JSON.parse(Deno.readTextFileSync("deno.json"));

const oldVersion = currentJson.version;
const newVersion = inc(oldVersion, type);

const newJson = Object.fromEntries(
  Object.entries(currentJson).map(([key, value]) =>
    key === "version" ? [key, newVersion] : [key, value]
  ),
);

Deno.writeTextFileSync("deno.json", JSON.stringify(newJson, null, 2));

const oldConstantsFile = Deno.readTextFileSync("src/constants.ts");
const newConstantsFile = oldConstantsFile.replace(
  /export const PACKAGE_VERSION = ".*"/,
  `export const PACKAGE_VERSION = "${newVersion}"`,
);
Deno.writeTextFileSync("src/constants.ts", newConstantsFile);

console.log(`Bumped version to ${newVersion}`);
