sap.ui.define([
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Input",
    "sap/m/Select",
    "sap/m/MessageBox",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/m/MessageToast",
    "sap/ui/core/Item",
    "sap/ui/unified/FileUploader",
    "sap/ui/core/library"
], function (Dialog, Button, Input, Select, MessageBox, Label, Text, VBox, MessageToast, Item, FileUploader, coreLibrary) {
    "use strict";

    const ValueState = coreLibrary.ValueState;
    const COUNTRIES = [
        { key: "PL", text: "Poland (PL)" },
        { key: "DE", text: "Germany (DE)" },
        { key: "CZ", text: "Czechia (CZ)" },
        { key: "SK", text: "Slovakia (SK)" },
        { key: "HU", text: "Hungary (HU)" }
    ];

    function findViewOf(control) {
        let current = control;
        while (current && !(current.isA && current.isA("sap.ui.core.mvc.View"))) {
            current = current.getParent();
        }
        return current;
    }

    /**
     * Fiori Elements does not always pass the button event to header action handlers,
     * so the List Report view is located through the UI5 element registry.
     */
    function findListReportView(oEvent) {
        const source = oEvent && typeof oEvent.getSource === "function" ? oEvent.getSource() : null;
        if (source) {
            const view = findViewOf(source);
            if (view) {
                return view;
            }
        }
        const views = Object.values(sap.ui.core.Element.registry.all()).filter(function (element) {
            return element.isA && element.isA("sap.ui.core.mvc.View") && /FilesList/.test(element.getId());
        });
        return views[0] || null;
    }

    function readFileAsText(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result)); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsText(file, "UTF-8");
        });
    }

    /** Dialog for importing a bank CSV file, calls the unbound action CreditService.importCsv. */
    const ImportController = {

        onImport: function (oEvent) {
            const oView = findListReportView(oEvent);
            const oModel = oView ? oView.getModel() : null;
            if (!oView || !oModel) {
                MessageBox.error("The application model is not available");
                return;
            }

            const oFileName = new Input({ placeholder: "e.g. bank-pl-2026-11.csv", width: "100%" });
            const oCountry = new Select({ width: "100%", items: COUNTRIES.map(c => new Item({ key: c.key, text: c.text })) });
            const oBank = new Input({ placeholder: "Bank name", width: "100%" });
            const oFileUploader = new FileUploader({
                width: "100%",
                placeholder: "Choose a CSV file",
                buttonText: "Browse...",
                fileType: ["csv", "txt"],
                change: function (oChangeEvent) {
                    const file = oChangeEvent.getParameter("files")[0];
                    if (file) {
                        oFileName.setValue(file.name);
                        oFileName.setValueState(ValueState.None);
                        oDialog.data("file", file);
                    }
                }
            });
            const oInfo = new Text({ text: "Expected columns: business unit; credit control area; BP code; BP name; CR limit; CR exposure (separator ';' or ','). Decimal comma allowed." });
            const oStatus = new Text({ text: "" });

            const oImportButton = new Button({
                text: "Import",
                type: "Emphasized",
                press: async function () {
                    const file = oDialog.data("file");
                    const fileName = oFileName.getValue().trim();
                    const country = oCountry.getSelectedKey();
                    const bank = oBank.getValue().trim();

                    if (!file) {
                        oStatus.setText("Choose a CSV file first.");
                        return;
                    }
                    if (!bank) {
                        oBank.setValueState(ValueState.Error);
                        oStatus.setText("Bank is required.");
                        return;
                    }

                    oImportButton.setEnabled(false);
                    oStatus.setText("Importing...");
                    try {
                        const csvContent = await readFileAsText(file);
                        const operation = oModel.bindContext("/importCsv(...)");
                        operation.setParameter("fileName", fileName || file.name);
                        operation.setParameter("country", country);
                        operation.setParameter("bank", bank);
                        operation.setParameter("csvContent", csvContent);
                        await operation.execute();

                        const result = operation.getBoundContext().getObject();
                        oDialog.close();
                        if (result.status === "ParseError") {
                            MessageBox.error("File rejected: " + (result.errorMessage || "invalid content"), {
                                title: "Import failed"
                            });
                        } else {
                            MessageToast.show("File imported: " + result.rowCount + " line(s)");
                        }
                        oModel.refresh();
                    } catch (error) {
                        oStatus.setText("Import failed: " + (error.message || error));
                    } finally {
                        oImportButton.setEnabled(true);
                    }
                }
            });
            const oCancelButton = new Button({
                text: "Cancel",
                press: function () { oDialog.close(); }
            });

            const oDialog = new Dialog({
                title: "Import bank CSV file",
                contentWidth: "32rem",
                content: [
                    new VBox({
                        items: [
                            new Label({ text: "CSV file", labelFor: oFileUploader }),
                            oFileUploader,
                            new Label({ text: "File name", labelFor: oFileName }).addStyleClass("sapUiTinyMarginTop"),
                            oFileName,
                            new Label({ text: "Country", labelFor: oCountry }).addStyleClass("sapUiTinyMarginTop"),
                            oCountry,
                            new Label({ text: "Bank", labelFor: oBank }).addStyleClass("sapUiTinyMarginTop"),
                            oBank,
                            oInfo,
                            oStatus
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: oImportButton,
                endButton: oCancelButton,
                afterClose: function () { oDialog.destroy(); }
            });

            oView.addDependent(oDialog);
            oDialog.open();
        }
    };

    return ImportController;
});
