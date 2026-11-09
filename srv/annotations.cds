using CreditService as service from './service';

annotate service.Files with @(
    UI.HeaderInfo: {
        TypeName      : 'Import file',
        TypeNamePlural: 'Import files',
        Title         : { $Type: 'UI.DataField', Value: fileName },
        Description   : { $Type: 'UI.DataField', Value: bank }
    },
    UI.SelectionFields: [ country, bank, status ],
    UI.LineItem: [
        { $Type: 'UI.DataField', Value: fileName,     Label: 'File name' },
        { $Type: 'UI.DataField', Value: bank,         Label: 'Bank' },
        { $Type: 'UI.DataField', Value: status,       Label: 'Status' },
        { $Type: 'UI.DataField', Value: rowCount,     Label: 'Rows' },
        { $Type: 'UI.DataField', Value: incorrectCount, Label: 'Incorrect rows' },
        { $Type: 'UI.DataField', Value: limitOk,      Label: 'Limit updated' },
        { $Type: 'UI.DataField', Value: exposureOk,   Label: 'Exposure updated' },
        { $Type: 'UI.DataField', Value: createdAt,    Label: 'Imported at' }
    ],
    UI.Facets: [
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'GeneralFacet',
            Label : 'General',
            Target: '@UI.FieldGroup#General'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'LinesFacet',
            Label : 'Business partner lines',
            Target: 'lines/@UI.LineItem'
        }
    ],
    UI.FieldGroup #General: {
        Data: [
            { $Type: 'UI.DataField', Value: fileName },
            { $Type: 'UI.DataField', Value: country },
            { $Type: 'UI.DataField', Value: bank },
            { $Type: 'UI.DataField', Value: status },
            { $Type: 'UI.DataField', Value: rowCount },
            { $Type: 'UI.DataField', Value: incorrectCount },
            { $Type: 'UI.DataField', Value: limitOk },
            { $Type: 'UI.DataField', Value: exposureOk },
            { $Type: 'UI.DataField', Value: errorMessage }
        ]
    },
    UI.Identification: [
        { $Type: 'UI.DataFieldForAction', Action: 'CreditService.process', Label: 'Process file', Criticality: #Positive },
        { $Type: 'UI.DataFieldForAction', Action: 'CreditService.retry',   Label: 'Retry failed lines' }
    ]
);

annotate service.BpLines with @(
    UI.LineItem: [
        { $Type: 'UI.DataField', Value: lineNo,           Label: 'Line' },
        { $Type: 'UI.DataField', Value: bpCode,           Label: 'BP code' },
        { $Type: 'UI.DataField', Value: bpName,           Label: 'BP name' },
        { $Type: 'UI.DataField', Value: crLimit,          Label: 'CR limit' },
        { $Type: 'UI.DataField', Value: limitStatus,      Label: 'Limit status' },
        { $Type: 'UI.DataField', Value: crExposure,       Label: 'CR exposure' },
        { $Type: 'UI.DataField', Value: exposureStatus,   Label: 'Exposure status' },
        { $Type: 'UI.DataField', Value: limitAttempts,    Label: 'Limit attempts' },
        { $Type: 'UI.DataField', Value: exposureAttempts, Label: 'Exposure attempts' },
        { $Type: 'UI.DataField', Value: validationError,  Label: 'Validation error' },
        { $Type: 'UI.DataField', Value: lastError,        Label: 'Last error' },
        { $Type: 'UI.DataField', Value: unitCode,         Label: 'Business unit' },
        { $Type: 'UI.DataField', Value: creditArea,       Label: 'Credit control area' }
    ],
    UI.SelectionFields: [ bpCode, limitStatus, exposureStatus ]
);

// Action availability depends on the file status (the service handlers enforce it as well).
// After an action the file header and the BP lines are reloaded.
annotate service.Files actions {
    process @(
        Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'status' }, 'Parsed' ] } },
        Common.SideEffects: { TargetEntities: [ lines ] }
    );
    retry @(
        Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'status' }, 'CompletedWithErrors' ] } },
        Common.SideEffects: { TargetEntities: [ lines ] }
    );
};
