namespace bpcredit;

using { cuid, managed } from '@sap/cds/common';

/** Status of an imported bank file. */
type FileStatus : String(24) enum {
    Parsed;                 // file accepted, lines created, waiting for processing
    Processing;             // processing in progress (transient)
    Completed;              // all lines sent to limit and exposure
    CompletedWithErrors;    // processing finished, some operations failed (can be retried)
    ParseError;             // CSV invalid, nothing imported
};

/** Status of a single SAP operation (limit update or exposure update) on a BP line. */
type OpStatus : String(10) enum {
    Pending;    // not sent yet
    Sent;       // accepted by SAP
    Failed;     // communication failure, can be retried
    Incorrect;  // line failed validation in the file, never sent
};

entity Files : cuid, managed {
    fileName     : String(255)  @title: 'File name';
    country      : String(2)    @title: 'Country';
    bank         : String(100)  @title: 'Bank';
    status       : FileStatus   @title: 'Status' default 'Parsed';
    rowCount     : Integer      @title: 'Rows in file' default 0;
    incorrectCount : Integer    @title: 'Incorrect rows' default 0;
    limitOk      : Integer      @title: 'Limit updated' default 0;
    exposureOk   : Integer      @title: 'Exposure updated' default 0;
    errorMessage : String(1000) @title: 'Error';
    lines        : Composition of many BpLines on lines.file = $self;
}

entity BpLines : cuid {
    file             : Association to Files;
    lineNo           : Integer      @title: 'Line';
    unitCode         : String(20)   @title: 'Business unit';
    creditArea       : String(20)   @title: 'Credit control area';
    bpCode           : String(20)   @title: 'BP code';
    bpName           : String(120)  @title: 'BP name';
    crLimit          : Decimal(15,2) @title: 'CR limit';
    crExposure       : Decimal(15,2) @title: 'CR exposure';
    limitStatus      : OpStatus     @title: 'Limit status'    default 'Pending';
    exposureStatus   : OpStatus     @title: 'Exposure status' default 'Pending';
    limitAttempts    : Integer      @title: 'Limit attempts'    default 0;
    exposureAttempts : Integer      @title: 'Exposure attempts' default 0;
    validationError  : String(500)  @title: 'Validation error';
    lastError        : String(500)  @title: 'Last error';
}
