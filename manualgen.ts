import { createRuntime } from "./lib.ts";

type Entities = {
  "input_number.script_test_helper": string;
};

export default createRuntime<Entities>();
