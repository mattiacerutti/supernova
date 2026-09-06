import {test, expect} from "vitest";
import {resolveSocketUrl} from "@/rpc/transport/endpoint";

test.each([
  ["http://127.0.0.1:4317", "ws://127.0.0.1:4317/ws"],
  ["https://host.example/api/?token=ignored#fragment", "wss://host.example/api/ws"],
  ["http://[::1]:1234", "ws://[::1]:1234/ws"],
])("resolves API endpoint %s independently of UI origin", (endpoint, expected) => {
  expect(resolveSocketUrl(endpoint)).toBe(expected);
});

test.each(["", "file:///app", "supernova://app", "http://user:secret@host"])("rejects invalid API endpoint %s", (endpoint) => {
  expect(() => resolveSocketUrl(endpoint)).toThrow();
});
