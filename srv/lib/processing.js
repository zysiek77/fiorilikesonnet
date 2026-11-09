'use strict';

const { CommunicationError } = require('./sap-simulator');

/**
 * Processes the SAP operations of BP lines.
 *
 * For every line:
 *   1. limit update, only if limitStatus is Pending or Failed
 *   2. exposure update, only if exposureStatus is Pending or Failed,
 *      executed even when the limit update failed
 * Lines with status Incorrect (failed validation on import) are skipped.
 *
 * A communication failure marks only that operation as Failed and the process
 * moves on. Re-running the function only touches operations that are not Sent
 * yet, so a retry never sends already accepted data again.
 *
 * @param {Array<object>} lines BP line records (mutated in place)
 * @param {{ updateLimit: Function, updateExposure: Function }} sap
 * @returns {Promise<Array<object>>} the same lines
 */
async function processLines(lines, sap) {
    for (const line of lines) {
        const errors = [];

        if (line.limitStatus === 'Pending' || line.limitStatus === 'Failed') {
            line.limitAttempts = (line.limitAttempts || 0) + 1;
            try {
                await sap.updateLimit(line);
                line.limitStatus = 'Sent';
            } catch (error) {
                if (!(error instanceof CommunicationError)) throw error;
                line.limitStatus = 'Failed';
                errors.push(`Limit: ${error.message}`);
            }
        }

        if (line.exposureStatus === 'Pending' || line.exposureStatus === 'Failed') {
            line.exposureAttempts = (line.exposureAttempts || 0) + 1;
            try {
                await sap.updateExposure(line);
                line.exposureStatus = 'Sent';
            } catch (error) {
                if (!(error instanceof CommunicationError)) throw error;
                line.exposureStatus = 'Failed';
                errors.push(`Exposure: ${error.message}`);
            }
        }

        line.lastError = errors.length > 0 ? errors.join('; ') : null;
    }
    return lines;
}

/**
 * Summarises the state of all lines of a file.
 * Incorrect lines are reported separately and do not make the file fail:
 * they can only be fixed in the bank file, so retry does not apply to them.
 * @returns {{ status: 'Completed'|'CompletedWithErrors', limitOk: number, exposureOk: number, failedLines: number, incorrectLines: number }}
 */
function summarize(lines) {
    const limitOk = lines.filter(l => l.limitStatus === 'Sent').length;
    const exposureOk = lines.filter(l => l.exposureStatus === 'Sent').length;
    const incorrectLines = lines.filter(l => l.limitStatus === 'Incorrect').length;
    const failedLines = lines.filter(l =>
        l.limitStatus === 'Failed' || l.exposureStatus === 'Failed'
    ).length;
    return {
        status: failedLines === 0 ? 'Completed' : 'CompletedWithErrors',
        limitOk,
        exposureOk,
        failedLines,
        incorrectLines
    };
}

module.exports = { processLines, summarize };
