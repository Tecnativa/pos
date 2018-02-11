/* Copyright 2014-2015 Taktik - Adil Houmadi
License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html)*/

odoo.define('pos_pricelist.widgets', function(require){
    "use strict";

    var screens = require('point_of_sale.screens');
    var PosBaseWidget = require('point_of_sale.BaseWidget');
    var formats = require('web.formats');

    var utils = require('web.utils');
    var round_di = utils.round_decimals;

    screens.OrderWidget.include({
        change_selected_order: function() {
            this._super();
            if (!this.pos.get_order()) {
                return
            }
            var partner = this.pos.get_order().get_client()
                ? this.pos.get_order().get_client()
                : false;
            this.pos.update_products_ui(partner);
        }
//        set_value: function (val) {
//            this._super(val);
//            var order = this.pos.get('selectedOrder');
//            if (this.editable && order.getSelectedLine()) {
//                var mode = this.numpad_state.get('mode');
//                if (mode === 'price') {
//                    order.getSelectedLine().set_manual_price(true);
//                }
//            }
//        }
    });

//    screens.ActionButtonWidget.include({
//        selectOrder: function (event) {
//            this._super(event);
//            var partner = this.order.get_client()
//                ? this.order.get_client()
//                : false;
//            this.pos.pricelist_engine.update_products_ui(partner);
//        }
//    });

//    screens.ProductListWidget.include({
//
//        renderElement: function () {
//            this._super();
//            var order = posmodel.get_order();
//            var customer = null;
//            if(order) {
//                customer = order.get_client();
//            }
//            this.pos.pricelist_engine.update_products_ui(customer);
//        }
//    });

});
