import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

declare global {
  /** React reads this to know it is inside a test `act()` scope. */
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Each test starts on an empty document.
afterEach(cleanup);
