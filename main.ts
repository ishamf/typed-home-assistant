import ha from "./autogen.ts";

ha.onStateChange("input_number.script_test_helper", (state, { prevState }) => {
  if (prevState < 50 && state > 50) {
    ha.callService("input_number.set_value", {
      value: 10,
    }, {
      entity_id: "input_number.script_test_helper",
    });
  }
});
