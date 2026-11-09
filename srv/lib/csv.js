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
 *   - a file is all-or-nothing: any invalid row makes the whole file invalid
 */

const EXPECTED_COLUMNS = 6;
const MAX_REPORTED_ERRORS = 20;
const AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/;

function detectSeparator(firstLine) {
    const semicolonCells = splitLine(firstLine, ';').length;
    if (semicolonCells === EXPECTED_COLUMNS) {
        return ';';
    }
    const commaCells = splitLine(firstLine, ',').length;
    if (commaCells === EXPECTED_COLUMNS) {
        return ',';
    }
    return firstLine.includes(';') ? ';' : ',';
}

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
 * @param {string} content raw CSV text
 * @returns {{ rows: Array<object>, errors: string[] }}
 */
function parseCsv(content) {
    const text = String(content ?? '').replace(/^﻿/, '');
    const physicalLines = text.split(/\r?\n/);
    const lines = physicalLines
        .map((line, index) => ({ line: line.trimEnd(), lineNo: index + 1 }))
        .filter(entry => entry.line.trim() !== '');

    const errors = [];
    const rows = [];

    if (lines.length === 0) {
        return { rows, errors: ['File is empty'] };
    }

    const separator = detectSeparator(lines[0].line);

    lines.forEach(({ line, lineNo }, index) => {
        const cells = splitLine(line, separator);

        if (index === 0 && looksLikeHeader(cells)) {
            return;
        }

        if (cells.length !== EXPECTED_COLUMNS) {
            errors.push(`Line ${lineNo}: expected ${EXPECTED_COLUMNS} columns, found ${cells.length}`);
            return;
        }

        const [unitCode, creditArea, bpCode, bpName, limitText, exposureText] = cells;
        const rowErrors = [];

        if (!unitCode) rowErrors.push('business unit is empty');
        if (!creditArea) rowErrors.push('credit control area is empty');
        if (!bpCode) rowErrors.push('BP code is empty');

        const crLimit = parseAmount(limitText);
        const crExposure = parseAmount(exposureText);
        if (Number.isNaN(crLimit)) rowErrors.push(`invalid CR limit "${limitText}"`);
        if (Number.isNaN(crExposure)) rowErrors.push(`invalid CR exposure "${exposureText}"`);

        if (rowErrors.length > 0) {
            errors.push(`Line ${lineNo}: ${rowErrors.join(', ')}`);
            return;
        }

        rows.push({
            lineNo,
            unitCode,
            creditArea,
            bpCode,
            bpName,
            crLimit,
            crExposure
        });
    });

    if (errors.length > MAX_REPORTED_ERRORS) {
        const hidden = errors.length - MAX_REPORTED_ERRORS;
        errors.splice(MAX_REPORTED_ERRORS, hidden, `... and ${hidden} more error(s)`);
    }

    return { rows, errors };
}

module.exports = { parseCsv, parseAmount, splitLine };
