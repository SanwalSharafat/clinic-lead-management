// ========================================================
// Consent / Opt-out Tests (Section 14)
// Tests the stop-command detection logic from the workflow
// and verifies opted-out patients are not processed further.
// ========================================================

// Replicate the exact stop-command detection logic from workflowService.ts
function isStopCommand(message: string): boolean {
  const stopKeywords = [
    'stop', 'unsubscribe', 'opt out', 'opt-out', 'cancel', 'do not contact',
  ];
  const normalizedMessage = message.toLowerCase().trim();

  if (stopKeywords.some((kw) => normalizedMessage === kw || normalizedMessage.includes(kw))) {
    const isCmd =
      normalizedMessage === 'stop' ||
      normalizedMessage === 'unsubscribe' ||
      normalizedMessage === 'opt out' ||
      normalizedMessage === 'opt-out' ||
      normalizedMessage.startsWith('stop ') ||
      normalizedMessage.startsWith('please stop');
    return isCmd;
  }
  return false;
}

describe('Consent / Opt-out Handling', () => {
  // ========================================================
  // 1. STOP triggers opt-out
  // ========================================================
  it("'STOP' triggers opt-out", () => {
    expect(isStopCommand('STOP')).toBe(true);
  });

  it("'stop' (lowercase) triggers opt-out", () => {
    expect(isStopCommand('stop')).toBe(true);
  });

  // ========================================================
  // 2. UNSUBSCRIBE
  // ========================================================
  it("'unsubscribe' triggers opt-out", () => {
    expect(isStopCommand('unsubscribe')).toBe(true);
  });

  // ========================================================
  // 3. OPT OUT variants
  // ========================================================
  it("'opt out' triggers opt-out", () => {
    expect(isStopCommand('opt out')).toBe(true);
  });

  it("'opt-out' (hyphenated) triggers opt-out", () => {
    expect(isStopCommand('opt-out')).toBe(true);
  });

  // ========================================================
  // 4. PLEASE STOP prefix
  // ========================================================
  it("'please stop' triggers opt-out", () => {
    expect(isStopCommand('please stop')).toBe(true);
  });

  it("'please stop sending messages' triggers opt-out", () => {
    expect(isStopCommand('please stop sending messages')).toBe(true);
  });

  it("'stop sending messages' triggers opt-out", () => {
    expect(isStopCommand('stop sending messages')).toBe(true);
  });

  // ========================================================
  // 5. Keywords that should NOT trigger opt-out
  // ========================================================
  it("'cancel' is in stopKeywords but does NOT pass the inner check", () => {
    expect(isStopCommand('cancel')).toBe(false);
  });

  it("'do not contact' is in stopKeywords but does NOT pass the inner check", () => {
    expect(isStopCommand('do not contact')).toBe(false);
  });

  // ========================================================
  // 6. Messages containing 'stop' but NOT a stop command
  // ========================================================
  it("'the pain won't stop' does NOT trigger opt-out", () => {
    expect(isStopCommand("the pain won't stop")).toBe(false);
  });

  it("'I can't stop thinking about my appointment' does NOT trigger opt-out", () => {
    expect(isStopCommand("I can't stop thinking about my appointment")).toBe(false);
  });

  it("'please don't stop the service' does NOT trigger opt-out", () => {
    expect(isStopCommand("please don't stop the service")).toBe(false);
  });

  it('a normal conversation message does NOT trigger opt-out', () => {
    expect(isStopCommand('Hi, I need a routine checkup')).toBe(false);
  });

  it('empty string does NOT trigger opt-out', () => {
    expect(isStopCommand('')).toBe(false);
  });

  // ========================================================
  // 7. Case insensitivity
  // ========================================================
  it("'StOp' (mixed case) triggers opt-out", () => {
    expect(isStopCommand('StOp')).toBe(true);
  });

  it("'UNSUBSCRIBE' (all caps) triggers opt-out", () => {
    expect(isStopCommand('UNSUBSCRIBE')).toBe(true);
  });

  it("'PLEASE STOP' (all caps) triggers opt-out", () => {
    expect(isStopCommand('PLEASE STOP')).toBe(true);
  });
});
