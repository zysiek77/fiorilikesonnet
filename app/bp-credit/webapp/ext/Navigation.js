sap.ui.define([
    "sap/ui/core/Component"
], function (Component) {
    "use strict";

    /**
     * Navigation helpers used by custom header actions of the Object Page.
     * The root component is registered with id "bpcredit" (see index.html).
     */
    return {
        backToList: function () {
            const rootComponent = Component.getComponentById("bpcredit");
            if (rootComponent && rootComponent.getRouter) {
                rootComponent.getRouter().navTo("FilesList", {}, true);
                return;
            }
            window.history.back();
        }
    };
});
