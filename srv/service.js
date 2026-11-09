'use strict';

const cds = require('@sap/cds');
const { parseCsv } = require('./lib/csv');
const { createSapSimulatorFromEnv } = require('./lib/sap-simulator');
const { processLines, summarize } = require('./lib/processing');

const MAX_ERROR_LENGTH = 1000;

module.exports = class CreditService extends cds.ApplicationService {

    async init() {
        const { Files, BpLines } = this.entities;
        const sap = createSapSimulatorFromEnv();

        const fileKey = req => {
            const key = req.params[0];
            return typeof key === 'object' ? key.ID : key;
        };

        const loadFile = (ID) => SELECT.one.from(Files).where({ ID });

        const runFile = async (req, { allowedStatus, actionName }) => {
            const ID = fileKey(req);
            const file = await loadFile(ID);
            if (!file) {
                return req.reject(404, 'File not found');
            }
            if (file.status !== allowedStatus) {
                return req.reject(409, `Action ${actionName} is not allowed for a file in status ${file.status}`);
            }

            await UPDATE(Files, ID).set({ status: 'Processing' });

            const lines = await SELECT.from(BpLines).where({ file_ID: ID }).orderBy('lineNo');
            await processLines(lines, sap);

            for (const line of lines) {
                await UPDATE(BpLines, line.ID).set({
                    limitStatus: line.limitStatus,
                    exposureStatus: line.exposureStatus,
                    limitAttempts: line.limitAttempts,
                    exposureAttempts: line.exposureAttempts,
                    lastError: line.lastError
                });
            }

            const summary = summarize(lines);
            const messages = [];
            if (summary.failedLines > 0) {
                messages.push(`${summary.failedLines} line(s) with failed operations. Use "Retry failed lines".`);
            }
            if (summary.incorrectLines > 0) {
                messages.push(`${summary.incorrectLines} incorrect line(s) skipped.`);
            }
            await UPDATE(Files, ID).set({
                status: summary.status,
                limitOk: summary.limitOk,
                exposureOk: summary.exposureOk,
                errorMessage: messages.length > 0 ? messages.join(' ') : null
            });

            return loadFile(ID);
        };

        this.on('process', Files, req => runFile(req, {
            allowedStatus: 'Parsed',
            actionName: 'process'
        }));

        this.on('retry', Files, req => runFile(req, {
            allowedStatus: 'CompletedWithErrors',
            actionName: 'retry'
        }));

        this.on('importCsv', async req => {
            const { fileName, country, bank, csvContent } = req.data;

            if (!fileName) return req.reject(400, 'File name is required');
            if (!/^[A-Z]{2}$/.test(country || '')) return req.reject(400, 'Country must be a 2-letter ISO code, e.g. PL');
            if (!bank) return req.reject(400, 'Bank is required');
            if (!csvContent || !csvContent.trim()) return req.reject(400, 'File content is empty');

            const { rows, fileErrors } = parseCsv(csvContent);
            const ID = cds.utils.uuid();

            if (fileErrors.length > 0) {
                await INSERT.into(Files).entries({
                    ID, fileName, country, bank,
                    status: 'ParseError',
                    rowCount: 0,
                    incorrectCount: 0,
                    limitOk: 0,
                    exposureOk: 0,
                    errorMessage: fileErrors.join(' | ').slice(0, MAX_ERROR_LENGTH)
                });
                return loadFile(ID);
            }

            const incorrectCount = rows.filter(row => row.validationError).length;

            await INSERT.into(Files).entries({
                ID, fileName, country, bank,
                status: 'Parsed',
                rowCount: rows.length,
                incorrectCount,
                limitOk: 0,
                exposureOk: 0,
                errorMessage: incorrectCount > 0
                    ? `${incorrectCount} incorrect line(s) will be skipped. See "Incorrect rows" and "Validation error" in the lines.`
                    : null
            });

            await INSERT.into(BpLines).entries(rows.map(row => {
                const incorrect = Boolean(row.validationError);
                return {
                    ...row,
                    ID: cds.utils.uuid(),
                    file_ID: ID,
                    limitStatus: incorrect ? 'Incorrect' : 'Pending',
                    exposureStatus: incorrect ? 'Incorrect' : 'Pending',
                    limitAttempts: 0,
                    exposureAttempts: 0,
                    lastError: null
                };
            }));

            return loadFile(ID);
        });

        return super.init();
    }
};
