/* Copyright 2014-2015 Taktik - Adil Houmadi
License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html)*/

odoo.define('pos_pricelist.screens', function(require){
    "use strict";

    var screens = require('point_of_sale.screens');

    screens.ClientListScreenWidget.extend({
        save_changes: function () {
            this._super();

            if (this.has_client_changed()) {
                var currentOrder = this.pos.get('selectedOrder');
                var orderLines = currentOrder.get('orderLines').models;
                var partner = currentOrder.get_client();

                this.pos.pricelist_engine.update_products_ui(partner);
                this.pos.pricelist_engine.update_ticket(partner, orderLines);
            }
        }
    });
});
