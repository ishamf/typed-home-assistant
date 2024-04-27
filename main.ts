import ha from "./manualgen.ts";

ha.onStateChange("input_number.script_test_helper", (state) => {
  console.log(state);
});
