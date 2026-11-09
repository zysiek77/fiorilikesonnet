'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseAmount } = require('./csv');

test('parses semicolon separated file with header and Polish decimals', () => {
    const csv = [
        'kod jednostki;obszar kontroli;kod BP;nazwa BP;cr limit;cr exposure',
        'PL01;1000;BP0001;Acme Sp. z o.o.;10000,50;2500,00',
        'PL01;1000;BP0002;Beta S.A.;1 250 000,00;0'
    ].join('\n');

    const { rows, errors } = parseCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].bpCode, 'BP0001');
    assert.equal(rows[0].crLimit, 10000.5);
    assert.equal(rows[1].crLimit, 1250000);
    assert.equal(rows[1].crExposure, 0);
    assert.equal(rows[0].lineNo, 2);
});

test('accepts file without header and comma separator with dot decimals', () => {
    const { rows, errors } = parseCsv('PL01,1000,BP0001,"Acme; Holding",5000.25,-100.00\n');
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].bpName, 'Acme; Holding');
    assert.equal(rows[0].crExposure, -100);
});

test('reports wrong column count and invalid amounts with line numbers', () => {
    const csv = [
        'PL01;1000;BP0001;Acme;100;10',
        'PL01;1000;BP0002;Beta;abc;10',
        'PL01;1000;BP0003;Gamma'
    ].join('\n');

    const { rows, errors } = parseCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /^Line 2: invalid CR limit "abc"/);
    assert.match(errors[1], /^Line 3: expected 6 columns, found 4/);
});

test('reports empty mandatory fields', () => {
    const { errors } = parseCsv('PL01;;BP0001;Acme;1;1');
    assert.match(errors[0], /credit control area is empty/);
});

test('empty content is an error', () => {
    assert.deepEqual(parseCsv('  \n \n').errors, ['File is empty']);
});

test('strips UTF-8 BOM and ignores blank lines and CRLF', () => {
    const { rows, errors } = parseCsv('﻿PL01;1;BP1;A;1;2\r\n\r\nPL01;1;BP2;B;3;4\r\n');
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 2);
});

test('parseAmount handles thousand separators and rejects garbage', () => {
    assert.equal(parseAmount('1.234.567,89'), 1234567.89);
    assert.equal(parseAmount(' 12 345 '), 12345);
    assert.ok(Number.isNaN(parseAmount('12,345,678')));
    assert.ok(Number.isNaN(parseAmount('')));
});
