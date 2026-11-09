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
            await UPDATE(Files, ID).set({
                status: summary.status,
                limitOk: summary.limitOk,
                exposureOk: summary.exposureOk,
                errorMessage: summary.failedLines > 0
                    ? `${summary.failedLines} line(s) with failed operations. Use "Retry failed lines".`
                    : null
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

            const { rows, errors } = parseCsv(csvContent);
            const ID = cds.utils.uuid();

            if (errors.length > 0) {
                await INSERT.into(Files).entries({
                    ID, fileName, country, bank,
                    status: 'ParseError',
                    rowCount: 0,
                    limitOk: 0,
                    exposureOk: 0,
                    errorMessage: errors.join(' | ').slice(0, MAX_ERROR_LENGTH)
                });
                return loadFile(ID);
            }

            await INSERT.into(Files).entries({
                ID, fileName, country, bank,
                status: 'Parsed',
                rowCount: rows.length,
                limitOk: 0,
                exposureOk: 0
            });

            if (rows.length > 0) {
                await INSERT.into(BpLines).entries(rows.map(row => ({
                    ...row,
                    ID: cds.utils.uuid(),
                    file_ID: ID,
                    limitStatus: 'Pending',
                    exposureStatus: 'Pending',
                    limitAttempts: 0,
                    exposureAttempts: 0
                })));
            }

            return loadFile(ID);
        });

        return super.init();
    }
};
