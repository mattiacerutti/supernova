import {expect, test} from "bun:test";
import type {DesktopUpdateState} from "@supernova/contracts/desktop/api";
import type {UpdaterEvent} from "@/updates/state";
import {INITIAL_UPDATE_STATE, reduceUpdateState} from "@/updates/state";

const checkingState: DesktopUpdateState = {status: "checking", version: null, downloadPercent: null, message: null};
const availableState: DesktopUpdateState = {status: "available", version: "0.1.0", downloadPercent: null, message: null};
const downloadingState: DesktopUpdateState = {status: "downloading", version: "0.1.0", downloadPercent: 40, message: null};
const downloadedState: DesktopUpdateState = {status: "downloaded", version: "0.1.0", downloadPercent: null, message: null};
const errorState: DesktopUpdateState = {status: "error", version: "0.1.0", downloadPercent: null, message: "network unreachable"};

interface ReducerCase {
  readonly name: string;
  readonly state: DesktopUpdateState;
  readonly event: UpdaterEvent;
  readonly want: DesktopUpdateState;
}

const cases: ReadonlyArray<ReducerCase> = [
  {name: "idle starts checking", state: INITIAL_UPDATE_STATE, event: {type: "checking"}, want: checkingState},
  {name: "an available update surfaces its version", state: checkingState, event: {type: "available", version: "0.1.0"}, want: availableState},
  {name: "no update returns to idle", state: availableState, event: {type: "not-available"}, want: INITIAL_UPDATE_STATE},
  {name: "download progress tracks the offered version", state: availableState, event: {type: "download-progress", percent: 40}, want: downloadingState},
  {name: "download completion keeps the downloaded version", state: downloadingState, event: {type: "downloaded", version: "0.1.0"}, want: downloadedState},
  {name: "a check never demotes an in-flight download", state: downloadingState, event: {type: "checking"}, want: downloadingState},
  {name: "an offered update never demotes an in-flight download", state: downloadingState, event: {type: "available", version: "0.2.0"}, want: downloadingState},
  {name: "a missing update never demotes an in-flight download", state: downloadingState, event: {type: "not-available"}, want: downloadingState},
  {name: "re-offering a downloaded update keeps it installable", state: downloadedState, event: {type: "available", version: "0.1.0"}, want: downloadedState},
  {name: "a missing update keeps a downloaded update installable", state: downloadedState, event: {type: "not-available"}, want: downloadedState},
  {name: "a newer version replaces a downloaded update", state: downloadedState, event: {type: "available", version: "0.2.0"}, want: {...availableState, version: "0.2.0"}},
  {name: "errors keep the offered version so the download can be retried", state: downloadingState, event: {type: "error", message: "network unreachable"}, want: errorState},
  {name: "re-checking after an error clears the message", state: errorState, event: {type: "checking"}, want: {...errorState, status: "checking", message: null}},
];

for (const {name, state, event, want} of cases) {
  test(name, () => {
    expect(reduceUpdateState(state, event)).toEqual(want);
  });
}
