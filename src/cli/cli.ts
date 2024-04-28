import { loadEnv, parse, stringify } from "../deps.ts";
import { chalk, input, parsePath, password, program } from "./deps.ts";
import { generate } from "./generator.ts";

const ENV_FILENAME = ".env";

async function main() {
  program.description("Set up or update a typed-home-assistant project").option(
    "-o, --output <filename>",
    "output filename",
    "ha.ts",
  );

  program.parse();

  await loadEnv({ export: true });

  let url = Deno.env.get("HOME_ASSISTANT_URL");

  if (!url) {
    url = await input({ message: "Enter your Home Assistant instance URL:" });
  }

  let token = Deno.env.get("HOME_ASSISTANT_TOKEN");

  if (!token) {
    token = await password({
      message:
        `Paste in your long-lived access token (create it in ${url}/profile/security > Long-lived access tokens)`,
    });
  }

  // Write it to the .env file
  let currentEnv: Record<string, string> = {};

  try {
    currentEnv = parse(await Deno.readTextFile(ENV_FILENAME));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e;
    }
  }

  await Deno.writeTextFile(
    ENV_FILENAME,
    stringify({
      ...currentEnv,
      HOME_ASSISTANT_URL: url,
      HOME_ASSISTANT_TOKEN: token,
    }),
  );

  await loadEnv({ export: true });

  const outputFile = program.opts().output;

  let isNewFile = false;

  try {
    Deno.stat(outputFile);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e;
    }

    isNewFile = true;
  }

  console.log(
    `${isNewFile ? "Generating" : "Updating"} ${chalk.bold(outputFile)}...`,
  );
  await generate(outputFile);
  console.log(`${isNewFile ? "Generation" : "Update"} successful!`);
  console.log(`Start writing your automations by importing the connection:`);
  console.log(chalk.bold(`import ha from './${parsePath(outputFile).name}';`));
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    Deno.exit(1);
  });
}
