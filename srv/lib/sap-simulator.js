'use strict';

/**
 * Simulates the two SAP interfaces used by the process:
 *   - credit limit update
 *   - credit exposure update
 *
 * Communication failures are random (SAP_FAILURE_RATE) and each call takes
 * SAP_LATENCY_MS. A failure throws CommunicationError, which the processing
 * engine treats as a retryable failure of that single operation.
 */

class CommunicationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CommunicationError';
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class SapSimulator {
    /**
     * @param {object} [options]
     * @param {number} [options.failureRate=0.2] probability in [0, 1] that a call fails
     * @param {number} [options.latencyMs=20] simulated response time
     * @param {() => number} [options.random=Math.random]
     * @param {(ms: number) => Promise<void>} [options.wait=sleep]
     */
    constructor({ failureRate = 0.2, latencyMs = 20, random = Math.random, wait = sleep } = {}) {
        if (!(failureRate >= 0 && failureRate <= 1)) {
            throw new Error(`failureRate must be between 0 and 1, got ${failureRate}`);
        }
        this.failureRate = failureRate;
        this.latencyMs = latencyMs;
        this.random = random;
        this.wait = wait;
    }

    updateLimit(line) {
        return this._call('limit', line);
    }

    updateExposure(line) {
        return this._call('exposure', line);
    }

    async _call(operation, line) {
        await this.wait(this.latencyMs);
        if (this.random() < this.failureRate) {
            throw new CommunicationError(`SAP ${operation} update for BP ${line.bpCode}: communication timeout (simulated)`);
        }
        return { operation, bpCode: line.bpCode, status: 'OK' };
    }
}

function createSapSimulatorFromEnv(env = process.env) {
    const failureRate = env.SAP_FAILURE_RATE !== undefined ? Number(env.SAP_FAILURE_RATE) : 0.2;
    const latencyMs = env.SAP_LATENCY_MS !== undefined ? Number(env.SAP_LATENCY_MS) : 20;
    return new SapSimulator({ failureRate, latencyMs });
}

module.exports = { SapSimulator, CommunicationError, createSapSimulatorFromEnv };
