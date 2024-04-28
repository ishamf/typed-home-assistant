/**
 * @module
 *
 * This module provides a CLI to generate the runtime file. See the readme for more information.
 */

import { existsSync, parse, process, readFile, stringify } from "../deps.ts";
import { ENV_FILENAME, loadEnv } from "../lib.ts";
import {
  chalk,
  input,
  parsePath,
  password,
  program,
  writeFile,
} from "./deps.ts";
import { generate } from "./generator.ts";

async function main() {
  program.description("Set up or update a typed-home-assistant project").option(
    "-o, --output <filename>",
    "output filename",
    "ha.ts",
  );

  program.parse();

  const currentEnv = await loadEnv();

  let needToUpdateEnv = false;

  let url = currentEnv["HOME_ASSISTANT_URL"];

  if (!url) {
    url = await input({ message: "Enter your Home Assistant instance URL:" });
    needToUpdateEnv = true;
  }

  let token = currentEnv["HOME_ASSISTANT_TOKEN"];

  if (!token) {
    token = await password({
      message:
        `Paste in your long-lived access token (create it in ${url}/profile/security > Long-lived access tokens)`,
    });
    needToUpdateEnv = true;
  }

  if (needToUpdateEnv) {
    // Write it to the .env file
    let currentEnv: Record<string, string> = {};

    if (existsSync(ENV_FILENAME)) {
      currentEnv = parse(await readFile(ENV_FILENAME, { encoding: "utf-8" }));
    }

    await writeFile(
      ENV_FILENAME,
      stringify({
        ...currentEnv,
        HOME_ASSISTANT_URL: url,
        HOME_ASSISTANT_TOKEN: token,
      }),
      { encoding: "utf-8" },
    );

    console.log(`The URL and token has been saved to ${chalk.bold(".env")}.`);
  }

  const outputFile = program.opts().output;

  const isNewFile = !existsSync(outputFile);

  console.log(
    `${isNewFile ? "Generating" : "Updating"} ${chalk.bold(outputFile)}...`,
  );
  await generate(outputFile);
  console.log(`${isNewFile ? "Generation" : "Update"} successful!`);

  if (isNewFile) {
    console.log(`Start writing your automations by importing the connection:`);
    console.log(
      chalk.bold(`import ha from './${parsePath(outputFile).name}';`),
    );
  }

  // Seems home-assistant-websocket cannot be closed quickly, just exit immediately after the generation is done
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
