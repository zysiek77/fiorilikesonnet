'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processLines, summarize } = require('./processing');
const { CommunicationError, SapSimulator } = require('./sap-simulator');

const makeLine = (bpCode, overrides = {}) => ({
    bpCode,
    limitStatus: 'Pending',
    exposureStatus: 'Pending',
    limitAttempts: 0,
    exposureAttempts: 0,
    lastError: null,
    ...overrides
});

/** Scripted SAP: each call consumes the next outcome for the given operation. */
function scriptedSap(script) {
    const calls = [];
    const next = (operation, line) => {
        calls.push(`${operation}:${line.bpCode}`);
        const outcome = (script[operation] || []).shift();
        if (outcome === 'fail') {
            throw new CommunicationError(`${operation} down`);
        }
        return Promise.resolve({ operation });
    };
    return {
        calls,
        updateLimit: line => next('limit', line),
        updateExposure: line => next('exposure', line)
    };
}

test('all operations succeed -> Completed', async () => {
    const lines = [makeLine('BP1'), makeLine('BP2')];
    const sap = scriptedSap({});
    await processLines(lines, sap);

    const summary = summarize(lines);
    assert.equal(summary.status, 'Completed');
    assert.equal(summary.limitOk, 2);
    assert.equal(summary.exposureOk, 2);
    assert.equal(summary.failedLines, 0);
    assert.deepEqual(sap.calls, ['limit:BP1', 'exposure:BP1', 'limit:BP2', 'exposure:BP2']);
});

test('limit failure does not block exposure and is recorded per operation', async () => {
    const lines = [makeLine('BP1')];
    const sap = scriptedSap({ limit: ['fail'] });
    await processLines(lines, sap);

    assert.equal(lines[0].limitStatus, 'Failed');
    assert.equal(lines[0].exposureStatus, 'Sent');
    assert.match(lines[0].lastError, /^Limit: limit down/);
    assert.equal(summarize(lines).status, 'CompletedWithErrors');
});

test('retry only sends operations that are not Sent yet', async () => {
    const lines = [makeLine('BP1'), makeLine('BP2')];
    await processLines(lines, scriptedSap({ limit: ['fail'], exposure: ['fail'] }));
    assert.equal(lines[0].limitStatus, 'Failed');
    assert.equal(lines[0].exposureStatus, 'Failed');

    const retrySap = scriptedSap({});
    await processLines(lines, retrySap);

    assert.deepEqual(retrySap.calls, ['limit:BP1', 'exposure:BP1']);
    assert.equal(lines[0].limitStatus, 'Sent');
    assert.equal(lines[0].exposureStatus, 'Sent');
    assert.equal(lines[0].limitAttempts, 2);
    assert.equal(lines[0].lastError, null);
    assert.equal(summarize(lines).status, 'Completed');
});

test('non communication errors are not swallowed', async () => {
    const lines = [makeLine('BP1')];
    const sap = {
        updateLimit: async () => { throw new TypeError('bug'); },
        updateExposure: async () => ({})
    };
    await assert.rejects(processLines(lines, sap), TypeError);
});

test('simulator with failureRate 1 fails every call and 0 never fails', async () => {
    const noWait = async () => {};
    const alwaysFail = new SapSimulator({ failureRate: 1, latencyMs: 0, wait: noWait });
    const never = new SapSimulator({ failureRate: 0, latencyMs: 0, wait: noWait });

    await assert.rejects(alwaysFail.updateLimit({ bpCode: 'BP1' }), CommunicationError);
    await assert.doesNotReject(never.updateExposure({ bpCode: 'BP1' }));
    assert.throws(() => new SapSimulator({ failureRate: 2 }), /between 0 and 1/);
});
