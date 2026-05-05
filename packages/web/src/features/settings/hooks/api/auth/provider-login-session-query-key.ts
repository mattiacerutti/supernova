export function providerLoginSessionQueryKey(loginSessionId: string | undefined) {
  return ["agent", "providers", "login", loginSessionId] as const;
}
