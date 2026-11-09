using bpcredit from '../db/schema';

@path: '/credit'
service CreditService {

    @readonly
    entity Files as projection on bpcredit.Files actions {
        action process() returns Files;
        action retry() returns Files;
    };

    @readonly
    entity BpLines as projection on bpcredit.BpLines;

    /** Imports a CSV file (content sent as text) for a given country and bank. */
    action importCsv(
        fileName   : String(255),
        country    : String(2),
        bank       : String(100),
        csvContent : LargeString
    ) returns Files;
}
