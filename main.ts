import ha from "./autogen.ts";

ha.onStateChange("input_number.script_test_helper", (state) => {
  console.log(state);
});
