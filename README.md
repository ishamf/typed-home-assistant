# typed-home-assistant

Write [Home Assistant](https://www.home-assistant.io/) automations using TypeScript.

## Quick Start

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

Then, write your automations using methods in the `ha` instance.

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

After you're done, run it using Deno:

```
deno run --allow-read --allow-env --allow-net main.ts
```

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
