# typed-home-assistant

Write [Home Assistant](https://www.home-assistant.io/) automations using TypeScript.

[![JSR](https://jsr.io/badges/@isham/typed-home-assistant)](https://jsr.io/@isham/typed-home-assistant)

## Quick Start

You can use the [Deno template](https://github.com/ishamf/typed-home-assistant-template-deno) or [Node template](https://github.com/ishamf/typed-home-assistant-template-node) to quickly set up an automation project.

```sh
# For Deno
deno run -A npm:degit https://github.com/ishamf/typed-home-assistant-template-deno project-name

# For Node
npx degit https://github.com/ishamf/typed-home-assistant-template-node project-name
```

You'll need to run `deno task update` or `npm run update` to connect to your HA instance and generate the types.

Once it's set up, write your automations using methods in the `ha` instance.
[Check out the docs](https://jsr.io/@isham/typed-home-assistant/doc/~/Runtime) to see what methods are available.

```ts
// main.ts
import ha from "./ha.ts";

ha.onStateChange("input_number.some_test", (state, { prevState }) => {
  if (state > 50 && prevState < 50) {
    ha.callService(
      "input_number.set_value",
      { value: 10 },
      { entity_id: "input_number.some_test" }
    );
  }
});
```

Entity IDs, service IDs, and service parameters will be type-checked and autocompleted.

## Manual Setup

### Deno

First, set up the connection to your instance and generate the types:

```sh
> deno run -A jsr:@isham/typed-home-assistant@^0.2/cli

? Enter your Home Assistant instance URL: https://demo.home-assistant.io
? Paste in your long-lived access token (create it in https://demo.home-assistant.io/profile/security > Long-lived access tokens)
The URL and token has been saved to .env.
Generating ha.ts...
Generation successful!
Start writing your automations by importing the connection:
import ha from './ha';
```

You can write the automations in a separate file that imports `ha.ts`.

After you're done, run it using Deno:

```
deno run --allow-read --allow-env --allow-net main.ts
```

### Node

Setting this up in node is a bit tricky. You can refer to the [template](https://github.com/ishamf/typed-home-assistant-template-node) for the detailed changes needed.

## Updating the Types

You can re-run the CLI to update the types.

```sh
> deno run -A jsr:@isham/typed-home-assistant@^0.2/cli

Updating ha.ts...
Update successful!
```

Set up a task in Deno to easily update the types:

```json
// deno.json
{
  "tasks": {
    "update": "deno run -A jsr:@isham/typed-home-assistant@^0.2/cli"
  }
}
```

```sh
deno task update
```
