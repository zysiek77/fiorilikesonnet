'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, parseAmount } = require('./csv');

test('parses semicolon separated file with header and Polish decimals', () => {
    const csv = [
        'kod jednostki;obszar kontroli;kod BP;nazwa BP;cr limit;cr exposure',
        'PL01;1000;BP0001;Acme Sp. z o.o.;10000,50;2500,00',
        'PL01;1000;BP0002;Beta S.A.;1 250 000,00;0'
    ].join('\n');

    const { rows, fileErrors } = parseCsv(csv);
    assert.deepEqual(fileErrors, []);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].bpCode, 'BP0001');
    assert.equal(rows[0].crLimit, 10000.5);
    assert.equal(rows[1].crLimit, 1250000);
    assert.equal(rows[1].crExposure, 0);
    assert.equal(rows[0].lineNo, 2);
    assert.ok(rows.every(row => row.validationError === null));
});

test('accepts file without header and comma separator with quoted separator in name', () => {
    const { rows, fileErrors } = parseCsv('PL01,1000,BP0001,"Acme; Holding",5000.25,-100.00\n');
    assert.deepEqual(fileErrors, []);
    assert.equal(rows[0].bpName, 'Acme; Holding');
    assert.equal(rows[0].crExposure, -100);
});

test('invalid rows are loaded as incorrect, valid rows are kept', () => {
    const csv = [
        'PL01;1000;BP0001;Acme;100;10',
        'PL01;1000;BP0002;Beta;abc;10',
        'PL01;1000;BP0003;Gamma'
    ].join('\n');

    const { rows, fileErrors } = parseCsv(csv);
    assert.deepEqual(fileErrors, []);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].validationError, null);
    assert.match(rows[1].validationError, /^Line 2: invalid CR limit "abc"/);
    assert.equal(rows[1].crLimit, null);
    assert.match(rows[2].validationError, /^Line 3: expected 6 columns, found 4/);
});

test('reports empty mandatory fields per row', () => {
    const { rows } = parseCsv('PL01;;BP0001;Acme;1;1');
    assert.match(rows[0].validationError, /credit control area is empty/);
});

test('one business unit per file: the other unit rows are incorrect', () => {
    const csv = [
        'PL01;1000;BP0001;Acme;1;1',
        'PL01;1000;BP0002;Beta;1;1',
        'PL02;2000;BP0003;Gamma;1;1'
    ].join('\n');

    const { rows, fileErrors } = parseCsv(csv);
    assert.deepEqual(fileErrors, []);
    assert.equal(rows[0].validationError, null);
    assert.equal(rows[1].validationError, null);
    assert.match(rows[2].validationError, /business unit PL02 differs from file unit PL01/);
});

test('single business unit rule uses the most frequent unit as the file unit', () => {
    const csv = [
        'PL02;2000;BP0001;Acme;1;1',
        'PL01;1000;BP0002;Beta;1;1',
        'PL01;1000;BP0003;Gamma;1;1'
    ].join('\n');

    const { rows } = parseCsv(csv);
    assert.match(rows[0].validationError, /business unit PL02 differs from file unit PL01/);
    assert.equal(rows[1].validationError, null);
    assert.equal(rows[2].validationError, null);
});

test('empty content and header-only content are file errors', () => {
    assert.deepEqual(parseCsv('  \n \n').fileErrors, ['File is empty']);
    assert.deepEqual(
        parseCsv('kod jednostki;obszar;kod BP;nazwa;cr limit;cr exposure').fileErrors,
        ['File contains no data rows']
    );
});

test('strips UTF-8 BOM and ignores blank lines and CRLF', () => {
    const { rows, fileErrors } = parseCsv('﻿PL01;1;BP1;A;1;2\r\n\r\nPL01;1;BP2;B;3;4\r\n');
    assert.deepEqual(fileErrors, []);
    assert.equal(rows.length, 2);
});

test('parseAmount handles thousand separators and rejects garbage', () => {
    assert.equal(parseAmount('1.234.567,89'), 1234567.89);
    assert.equal(parseAmount(' 12 345 '), 12345);
    assert.ok(Number.isNaN(parseAmount('12,345,678')));
    assert.ok(Number.isNaN(parseAmount('')));
});

test('sample files: valid sample has one unit, invalid sample is flagged', () => {
    const root = path.join(__dirname, '..', '..');
    const valid = parseCsv(fs.readFileSync(path.join(root, 'samples', 'bank-pl-sample.csv'), 'utf8'));
    assert.deepEqual(valid.fileErrors, []);
    assert.ok(valid.rows.every(row => row.validationError === null));
    assert.equal(new Set(valid.rows.map(row => row.unitCode)).size, 1);

    const invalid = parseCsv(fs.readFileSync(path.join(root, 'samples', 'bank-pl-invalid.csv'), 'utf8'));
    assert.ok(invalid.rows.some(row => row.validationError !== null));
    assert.ok(invalid.rows.some(row => row.validationError === null));
});
