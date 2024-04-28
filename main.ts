import ha from "./autogen.ts";

ha.onStateChange("input_number.script_test_helper", (state, {prevState}) => {
  if (prevState < 50 && state > 50) {
    console.log('Above 50!')
  }
});
