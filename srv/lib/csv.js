'use strict';

/**
 * Parser for bank CSV files.
 *
 * Expected columns (in order):
 *   0 business unit code (kod jednostki gospodarczej)
 *   1 credit control area (obszar kontroli kredytowej)
 *   2 BP code (kod BP)
 *   3 BP name (nazwa BP)
 *   4 CR limit
 *   5 CR exposure
 *
 * Conventions:
 *   - separator: ';' or ',', whichever splits the first line into 6 columns (';' preferred)
 *   - an optional header row is skipped when its amount columns contain letters
 *   - decimal separator: ',' (Polish) or '.'; spaces are ignored as thousand separators
 *   - fields may be wrapped in double quotes ("" escapes a quote)
 *
 * Validation is per row. Every data row is loaded; a row that breaks a rule gets
 * validationError set and is treated as Incorrect (skipped during processing).
 * Rules:
 *   - exactly 6 columns
 *   - business unit, credit control area and BP code are not empty
 *   - CR limit and CR exposure are valid amounts
 *   - one business unit per file: rows with a unit other than the file's unit
 *     (the most frequent unit among valid rows) are Incorrect
 */

const EXPECTED_COLUMNS = 6;
const AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/;

function splitLine(line, separator) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === separator) {
            cells.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    cells.push(current.trim());
    return cells;
}

function detectSeparator(firstLine) {
    if (splitLine(firstLine, ';').length === EXPECTED_COLUMNS) {
        return ';';
    }
    if (splitLine(firstLine, ',').length === EXPECTED_COLUMNS) {
        return ',';
    }
    return firstLine.includes(';') ? ';' : ',';
}

/** Returns a number with two decimals, or NaN when the text is not a valid amount. */
function parseAmount(text) {
    const normalized = String(text ?? '')
        .replace(/[\s ]/g, '')
        .replace(/\.(?=.*,)/g, '')   // dots before a decimal comma are thousand separators
        .replace(',', '.');
    if (!AMOUNT_PATTERN.test(normalized)) {
        return NaN;
    }
    return Number(normalized);
}

function looksLikeHeader(cells) {
    if (cells.length !== EXPECTED_COLUMNS) {
        return false;
    }
    const amountCells = `${cells[4]}${cells[5]}`;
    return /[a-zA-Z\u0080-￿]/.test(amountCells) && Number.isNaN(parseAmount(cells[4]));
}

/**
 * Enforces one business unit per file. The file's unit is the most frequent unit
 * among rows without other errors; every other unit is marked as an error.
 * Mutates the rows.
 */
function applySingleBusinessUnitRule(rows) {
    const counts = new Map();
    for (const row of rows) {
        if (!row.validationError && row.unitCode) {
            counts.set(row.unitCode, (counts.get(row.unitCode) || 0) + 1);
        }
    }
    if (counts.size <= 1) {
        return rows;
    }
    let fileUnit = null;
    for (const [unit, count] of counts) {
        if (fileUnit === null || count > counts.get(fileUnit)) {
            fileUnit = unit;
        }
    }
    for (const row of rows) {
        if (!row.validationError && row.unitCode && row.unitCode !== fileUnit) {
            row.validationError = `Line ${row.lineNo}: business unit ${row.unitCode} differs from file unit ${fileUnit} (one business unit per file)`;
        }
    }
    return rows;
}

/**
 * @param {string} content raw CSV text
 * @returns {{ rows: Array<object>, fileErrors: string[] }}
 *   rows: every data row, with validationError (string) or null
 *   fileErrors: problems that make the whole file unusable (empty file, no data rows)
 */
function parseCsv(content) {
    const text = String(content ?? '').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/)
        .map((line, index) => ({ line: line.trimEnd(), lineNo: index + 1 }))
        .filter(entry => entry.line.trim() !== '');

    if (lines.length === 0) {
        return { rows: [], fileErrors: ['File is empty'] };
    }

    const separator = detectSeparator(lines[0].line);
    const rows = [];

    lines.forEach(({ line, lineNo }, index) => {
        const cells = splitLine(line, separator);

        if (index === 0 && looksLikeHeader(cells)) {
            return;
        }

        const [unitCode = '', creditArea = '', bpCode = '', bpName = '', limitText = '', exposureText = ''] = cells;
        const problems = [];

        if (cells.length !== EXPECTED_COLUMNS) problems.push(`expected ${EXPECTED_COLUMNS} columns, found ${cells.length}`);
        if (!unitCode) problems.push('business unit is empty');
        if (!creditArea) problems.push('credit control area is empty');
        if (!bpCode) problems.push('BP code is empty');

        const crLimit = parseAmount(limitText);
        const crExposure = parseAmount(exposureText);
        if (Number.isNaN(crLimit)) problems.push(`invalid CR limit "${limitText}"`);
        if (Number.isNaN(crExposure)) problems.push(`invalid CR exposure "${exposureText}"`);

        rows.push({
            lineNo,
            unitCode,
            creditArea,
            bpCode,
            bpName,
            crLimit: Number.isNaN(crLimit) ? null : crLimit,
            crExposure: Number.isNaN(crExposure) ? null : crExposure,
            validationError: problems.length > 0 ? `Line ${lineNo}: ${problems.join(', ')}` : null
        });
    });

    if (rows.length === 0) {
        return { rows, fileErrors: ['File contains no data rows'] };
    }

    applySingleBusinessUnitRule(rows);
    return { rows, fileErrors: [] };
}

module.exports = { parseCsv, parseAmount, splitLine, applySingleBusinessUnitRule };
