/*
 Copyright 2014-2015 Taktik - Adil Houmadi
 Copyright 2018 Tecnativa - David Vidal
 License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html)
 */

odoo.define('pos_pricelist.models', function(require) {
    "use strict";

var Backbone = window.Backbone;
var exports = {};

var utils = require('web.utils');
var round_pr = utils.round_precision;

var pos_model = require('point_of_sale.models');

pos_model.load_fields('res.partner', 'property_product_pricelist');
pos_model.load_fields('product.product', ['categ_id', 'seller_ids'])
pos_model.load_fields('product.pricelist', ['name', 'display_name'])

var _super_posmodel = pos_model.PosModel.prototype;
pos_model.PosModel = pos_model.PosModel.extend({
    initialize: function(session, attributes) {
        this.arrange_elements();
        return _super_posmodel.initialize.call(this,session,attributes);
    },
    get_product_price: function (product) {
        var price = this.get_all_prices(product, 1).priceWithTax;
        return price;
    },
    _compute_all: function(tax, base_amount, quantity) {
        if (tax.amount_type === 'fixed') {
            var sign_base_amount = base_amount >= 0 ? 1 : -1;
            return (Math.abs(tax.amount) * sign_base_amount) * quantity;
        }
        if ((tax.amount_type === 'percent' && !tax.price_include) || (tax.amount_type === 'division' && tax.price_include)){
            return base_amount * tax.amount / 100;
        }
        if (tax.amount_type === 'percent' && tax.price_include){
            return base_amount - (base_amount / (1 + tax.amount / 100));
        }
        if (tax.amount_type === 'division' && !tax.price_include) {
            return base_amount / (1 - tax.amount / 100) - base_amount;
        }
        return false;
    },
    compute_all: function(taxes, price_unit, quantity, currency_rounding, no_map_tax) {
        var self = this;
        var list_taxes = [];
        var currency_rounding_bak = currency_rounding;
        if (this.company.tax_calculation_rounding_method == "round_globally"){
           currency_rounding = currency_rounding * 0.00001;
        }
        var total_excluded = round_pr(price_unit * quantity, currency_rounding);
        var total_included = total_excluded;
        var base = total_excluded;
        _(taxes).each(function(tax) {
            if (!tax){
                return;
            }
            if (tax.amount_type === 'group'){
                var ret = self.compute_all(tax.children_tax_ids, price_unit, quantity, currency_rounding);
                total_excluded = ret.total_excluded;
                base = ret.total_excluded;
                total_included = ret.total_included;
                list_taxes = list_taxes.concat(ret.taxes);
            }
            else {
                var tax_amount = self._compute_all(tax, base, quantity);
                tax_amount = round_pr(tax_amount, currency_rounding);

                if (tax_amount){
                    if (tax.price_include) {
                        total_excluded -= tax_amount;
                        base -= tax_amount;
                    }
                    else {
                        total_included += tax_amount;
                    }
                    if (tax.include_base_amount) {
                        base += tax_amount;
                    }
                    var data = {
                        id: tax.id,
                        amount: tax_amount,
                        name: tax.name,
                    };
                    list_taxes.push(data);
                }
            }
        });
        return {
            taxes: list_taxes,
            total_excluded: round_pr(total_excluded, currency_rounding_bak),
            total_included: round_pr(total_included, currency_rounding_bak)
        };
    },
    get_all_prices: function(product, quantity) {
        var price_unit = product.get_price(this.pricelist, 1) || product.price;
        var taxtotal = 0;

        var taxes_ids = product.taxes_id;
        var taxes =  this.taxes;
        var taxdetail = {};
        var product_taxes = [];

        _(taxes_ids).each(function(el){
            product_taxes.push(_.detect(taxes, function(t){
                return t.id === el;
            }));
        });

        var all_taxes = this.compute_all(product_taxes, price_unit, quantity, this.currency.rounding);
        _(all_taxes.taxes).each(function(tax) {
            taxtotal += tax.amount;
            taxdetail[tax.id] = tax.amount;
        });

        return {
            "priceWithTax": all_taxes.total_included,
            "priceWithoutTax": all_taxes.total_excluded,
            "tax": taxtotal,
            "taxDetails": taxdetail,
        };
    },
       /**
         * @param partner
         */
        update_products_ui: function (partner) {
            var db = this.db;
            if (this.gui.get_current_screen !== 'products') return;
            var product_list_ui
                = this.pos_widget.product_screen.$(
                '.product-list span.product'
            );
            for (var i = 0, len = product_list_ui.length; i < len; i++) {
                var product_ui = product_list_ui[i];
                var product_id = $(product_ui).data('product-id');
                var product = $.extend({}, db.get_product_by_id(product_id));
                var rules = db.find_product_rules(product);
                var quantities = [];
                quantities.push(1);
                for (var j = 0; j < rules.length; j++) {
                    if ($.inArray(rules[j].min_quantity, quantities) === -1) {
                        quantities.push(rules[j].min_quantity);
                    }
                }
                quantities = quantities.sort();
                var prices_displayed = '';
                for (var k = 0; k < quantities.length; k++) {
                    var qty = quantities[k];
                    var price = this.compute_price_all(
                        db, product, partner, qty
                    );
                    if (price !== false) {
                        if (this.pos.config.iface_tax_included) {
                            var prices = this.simulate_price(
                                product, partner, price, qty
                            );
                            price = prices['priceWithTax']
                        }
                        price = round_di(parseFloat(price)
                            || 0, this.pos.dp['Product Price']);
                        price = this.pos_widget.format_currency(price);
                        if (k == 0) {
                            $(product_ui).find('.price-tag').html(price);
                        }
                        prices_displayed += qty
                            + 'x &#8594; ' + price + '<br/>';
                    }
                }
                if (prices_displayed != '') {
                    $(product_ui).find('.price-tag').attr(
                        'data-original-title', prices_displayed
                    );
                    $(product_ui).find('.price-tag').attr(
                        'data-toggle', 'tooltip'
                    );
                    $(product_ui).find('.price-tag').tooltip(
                        {delay: {show: 50, hide: 100}}
                    );
                }
            }
        },
    /** Find model based on its name
     * @param {string} model_name
     * @returns {{}}
     */
    find_model: function(model_name) {
        var models = _super_posmodel.models;
        for (var i = 0; i < models.length; i++) {
            var model = models[i];
            if (model.model === model_name) {
                return model;
            }
        }
    },
    // Load extra methods to models
    arrange_elements: function() {
        var product_model = this.find_model('product.product');
        var pricelist_model = this.find_model('product.pricelist');
        product_model.loaded = function(product_model, products) {
            product_model.db.add_products(_.map(products, function (product) {
                return new exports.Product({}, product);
            }));
        };
        pricelist_model.loaded = function(pricelist_model, pricelists) {
            _.map(pricelists, function (pricelist) { pricelist.items = []; });
            pricelist_model.default_pricelist = _.findWhere(pricelists, {id: pricelist_model.config.pricelist_id[0]});
            pricelist_model.pricelist = pricelist_model.default_pricelist;
            pricelist_model.pricelists = pricelists;
        };
    },
})

// Load extra models
pos_model.load_models([
    {
        model:  'product.pricelist',
        fields: ['name', 'display_name', 'currency_id'],
        ids:    function(self){ return [self.config.pricelist_id[0]]; },
        loaded: function(self, pricelists){
            _.map(pricelists, function (pricelist) { pricelist.items = []; });
            self.default_pricelist = _.findWhere(pricelists, {id: self.config.pricelist_id[0]});
            self.pricelists = pricelists;
        },
    },{
        model:  'product.pricelist.item',
        domain: function(self) { return [['pricelist_id', 'in', _.pluck(self.pricelists, 'id')]]; },
        loaded: function(self, pricelist_items){
            var pricelist_by_id = {};
            _.each(self.pricelists, function (pricelist) {
                pricelist_by_id[pricelist.id] = pricelist;
            });

            _.each(pricelist_items, function (item) {
                var pricelist = pricelist_by_id[item.pricelist_id[0]];
                pricelist.items.push(item);
                item.base_pricelist = pricelist_by_id[item.base_pricelist_id[0]];
            });
        }
    },
])

exports.Product = Backbone.Model.extend({
    initialize: function(attr, options){
        _.extend(this, options);
    },

    // Backported from v11
    get_price: function(pricelist, quantity){
        var self = this;
        var date = moment().startOf('day');

        var category_ids = [];
        var category = this.categ;
        while (category) {
            category_ids.push(category.id);
            category = category.parent;
        }

        var pricelist_items = _.filter(pricelist.items, function (item) {
            return (! item.product_tmpl_id || item.product_tmpl_id[0] === self.product_tmpl_id) &&
                   (! item.product_id || item.product_id[0] === self.id) &&
                   (! item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
                   (! item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                   (! item.date_end || moment(item.date_end).isSameOrAfter(date));
        });

        var price = self.price;
        _.find(pricelist_items, function (rule) {
            if (rule.min_quantity && quantity < rule.min_quantity) {
                return false;
            }

            if (rule.base === 'pricelist') {
                price = self.get_price(rule.base_pricelist, quantity);
            } else if (rule.base === 'standard_price') {
                price = self.standard_price;
            }

            if (rule.compute_price === 'fixed') {
                price = rule.fixed_price;
                return true;
            } else if (rule.compute_price === 'percentage') {
                price = price - (price * (rule.percent_price / 100));
                return true;
            } else {
                var price_limit = price;
                price = price - (price * (rule.price_discount / 100));
                if (rule.price_round) {
                    price = round_pr(price, rule.price_round);
                }
                if (rule.price_surcharge) {
                    price += rule.price_surcharge;
                }
                if (rule.price_min_margin) {
                    price = Math.max(price, price_limit + rule.price_min_margin);
                }
                if (rule.price_max_margin) {
                    price = Math.min(price, price_limit + rule.price_max_margin);
                }
                return true;
            }

            return false;
        });

        // This return value has to be rounded with round_di before
        // being used further. Note that this cannot happen here,
        // because it would cause inconsistencies with the backend for
        // pricelist that have base == 'pricelist'.
        return price;
    },
});

var _super_orderline = pos_model.Orderline.prototype;
pos_model.Orderline = pos_model.Orderline.extend({
    get_all_prices: function(){
        // So we can apply pricelists based on qty
        var price = _super_orderline.get_all_prices.apply(this, arguments);
        if  (!this.pos.pricelist.pricelist_items) {
            return price;
        }
        var quantity = this.get_quantity();
        var product =  this.get_product();
        var price_unit = product.get_price(this.pricelist, quantity);
        var taxes_ids = product.taxes_id;
        var taxes =  this.pos.taxes;
        var taxdetail = {};
        var product_taxes = [];
        _(taxes_ids).each(function(el){
            product_taxes.push(_.detect(taxes, function(t){
                return t.id === el;
            }));
        });
        var all_taxes = this.compute_all(product_taxes, price_unit, this.get_quantity(), this.pos.currency.rounding);
        _(all_taxes.taxes).each(function(tax) {
            taxtotal += tax.amount;
            taxdetail[tax.id] = tax.amount;
        });
        return {
            "priceWithTax": all_taxes.total_included,
            "priceWithoutTax": all_taxes.total_excluded,
            "tax": taxtotal,
            "taxDetails": taxdetail,
        };
    },
})


//    /**
//     * Extend the POS model
//     */
//    var PosModelParent = models.PosModel;
//    models.PosModel = models.PosModel.extend({
//        /**
//         * @param session
//         * @param attributes
//         */
//        initialize: function (session, attributes) {
//            PosModelParent.prototype.initialize.apply(this, arguments);
//            this.pricelist_engine = new models.PricelistEngine({
//                'pos': this,
//                'db': this.db,
//                'pos_widget': this.chrome.widgets
//            });
//            arrange_elements(this);
//        },
//        /**
//         * find model based on name
//         * @param model_name
//         * @returns {{}}
//         */
//        find_model: function (model_name) {
//            var self = this;
//            var lookup = {};
//            for (var i = 0, len = self.models.length; i < len; i++) {
//                if (self.models[i].model === model_name) {
//                    lookup[i] = self.models[i]
//                }
//            }
//            return lookup
//        },
//        /**
//         * @param removed_order
//         * @param index
//         * @param reason
//         */
//        on_removed_order: function (removed_order, index, reason) {
//            PosModelParent.prototype.on_removed_order.apply(this, arguments);
//            if ((reason === 'abandon' || removed_order.temporary)
//                && this.get('orders').size() > 0) {
//                var current_order = (this.get('orders').at(index)
//                || this.get('orders').last());
//                var partner = current_order.get_client() ?
//                    current_order.get_client() :
//                    false;
//                this.pricelist_engine.update_products_ui(partner);
//            }
//        },
//
//        after_load_server_data: function(){
//             this.load_orders();
//             this.set_start_order();
//
//            for (var id in this.db.product_by_id) {
//                if (this.db.product_by_id.hasOwnProperty(id)) {
//                    var product = this.db.product_by_id[id];
//                    var orderline = new models.Orderline({}, {
//                        pos: this.chrome.pos,
//                        order: this.get_order(),
//                        product: product,
//                        price: product.price
//                    });
//                    var prices = orderline.get_all_prices();
//                    this.db.product_by_id[id].price_with_taxes
//                        = prices['priceWithTax']
//                }
//            }
//
//             if(this.config.use_proxy){
//                 return this.connect_to_proxy();
//             }
//        },
//    });
//
//    /**
//     * Extend the order
//     */
//    models.Order = models.Order.extend({
//        /**
//         * override this method to merge lines
//         * TODO : Need some refactoring in the standard POS to Do it better
//         * TODO : from line 73 till 85, we need to move this to another method
//         * @param product
//         * @param options
//         */
//        addProduct: function (product, options) {
//            options = options || {};
//            var attr = JSON.parse(JSON.stringify(product));
//            attr.pos = this.pos;
//            attr.order = this;
//            var line = new models.Orderline({}, {
//                pos: this.pos,
//                order: this,
//                product: product
//            });
//            var self = this;
//            var found = false;
//
//            if (options.quantity !== undefined) {
//                line.set_quantity(options.quantity);
//            }
//            if (options.price !== undefined) {
//                line.set_unit_price(options.price);
//            }
//            if (options.discount !== undefined) {
//                line.set_discount(options.discount);
//            }
//
//            var orderlines = [];
//            if (self.get('orderLines').models !== undefined) {
//                orderlines = self.get('orderLines').models;
//            }
//            for (var i = 0; i < orderlines.length; i++) {
//                var _line = orderlines[i];
//                if (_line && _line.can_be_merged_with(line) &&
//                    options.merge !== false) {
//                    _line.merge(line);
//                    found = true;
//                    break;
//                }
//            }
//            if (!found) {
//                this.get('orderLines').add(line);
//            }
//            this.selectLine(this.getLastOrderline());
//        }
//    });
//
//    /**
//     * Extend the Order line
//     */
//    var OrderlineParent = models.Orderline;
//    models.Orderline = models.Orderline.extend({
//        /**
//         * @param attr
//         * @param options
//         */
//        initialize: function (attr, options) {
//            OrderlineParent.prototype.initialize.call(this, attr, options);
//            this.manual_price = false;
//            if (this.product !== undefined) {
//                var qty = this.compute_qty(this.order, this.product);
//                var partner = this.order ? this.order.get_client() : null;
//                var product = this.product;
//                var db = this.pos.db;
//                var price = this.pos.pricelist_engine.compute_price_all(
//                    db, product, partner, qty
//                );
//                if (price !== false) {
//                    this.price = price;
//                }
//            }
//        },
//        /**
//         * @param state
//         */
//        set_manual_price: function (state) {
//            this.manual_price = state;
//        },
//        /**
//         * @param quantity
//         */
//        set_quantity: function (quantity) {
//            OrderlineParent.prototype.set_quantity.call(this, quantity);
//            var partner = this.order.get_client();
//            var product = this.product;
//            var db = this.pos.db;
//            var price = this.pos.pricelist_engine.compute_price_all(
//                db, product, partner, quantity
//            );
//            if (price !== false) {
//                this.price = price;
//            }
//            this.trigger('change', this);
//        },
//        /**
//         * override this method to take fiscal positions in consideration
//         * get all price
//         * TODO : find a better way to do it : need some refactoring
//         * in the pos standard
//         * @returns {{
//         *  priceWithTax: *, priceWithoutTax: *, tax: number, taxDetails: {}
//         *  }}
//         */
//        get_all_prices: function () {
//            var base = this.get_base_price();
//            var totalTax = base;
//            var totalNoTax = base;
//            var taxtotal = 0;
//            var taxdetail = {};
//            var product_taxes = this.get_applicable_taxes_for_orderline();
//            var all_taxes = _(this.compute_all(product_taxes, base)).flatten();
//            _(all_taxes).each(function (tax) {
//                if (tax.price_include) {
//                    totalNoTax -= tax.amount;
//                } else {
//                    totalTax += tax.amount;
//                }
//                taxtotal += tax.amount;
//                taxdetail[tax.id] = tax.amount;
//            });
//            totalNoTax = round_pr(totalNoTax, this.pos.currency.rounding);
//            return {
//                "priceWithTax": totalTax,
//                "priceWithoutTax": totalNoTax,
//                "tax": taxtotal,
//                "taxDetails": taxdetail
//            };
//        },
//        /**
//         * Override this method to avoid a return false
//         * if the price is different
//         * Check super method : (this.price !== orderline.price)
//         * is not necessary in our case
//         * @param orderline
//         * @returns {boolean}
//         */
//        can_be_merged_with: function (orderline) {
//            var result = OrderlineParent.prototype.can_be_merged_with.apply(
//                this, arguments
//            );
//            if (!result) {
//                if (!this.manual_price) {
//                    return (
//                        this.get_product().id === orderline.get_product().id
//                    );
//                } else {
//                    return false;
//                }
//            }
//            return true;
//        },
//        /**
//         * Override to set price
//         * @param orderline
//         */
//        merge: function (orderline) {
//            OrderlineParent.prototype.merge.apply(this, arguments);
//            this.set_unit_price(orderline.price);
//        },
//        /**
//         * @param order
//         * @param product
//         * @returns {number}
//         */
//        compute_qty: function (order, product) {
//            var qty = 1;
//            var orderlines = [];
//            if (order && order.orderlines.models !== undefined) {
//                orderlines = order.orderlines.models;
//            }
//            for (var i = 0; i < orderlines.length; i++) {
//                if (orderlines[i].product.id === product.id
//                    && !orderlines[i].manual_price) {
//                    qty += orderlines[i].quantity;
//                }
//            }
//            return qty;
//        },
//        /**
//         * @returns {Array}
//         */
//        get_applicable_taxes_for_orderline: function () {
//            // find applicable taxes for this product and this customer
//            var product = this.get_product();
//            var product_tax_ids = product.taxes_id;
//            var product_taxes = [];
//            var taxes = this.pos.taxes;
//            var partner = this.order ? this.order.get_client() : null;
//            if (partner && partner.property_account_position) {
//                product_tax_ids =
//                    this.pos.db.map_tax(
//                        partner.property_account_position[0], product_tax_ids
//                    );
//            }
//            for (var i = 0, ilen = product_tax_ids.length;
//                 i < ilen; i++) {
//                var tax_id = product_tax_ids[i];
//                var tax = _.detect(taxes, function (t) {
//                    return t.id === tax_id;
//                });
//                product_taxes.push(tax);
//            }
//            return product_taxes;
//        },
//        get_display_unit_price: function () {
//            var rounding = this.pos.currency.rounding;
//            if (this.pos.config.iface_tax_included) {
//                return round_pr(this.get_price_with_tax() / this.get_quantity(), rounding);
//            } else {
//                return round_pr(this.get_base_price() / this.get_quantity(), rounding);
//            }
//        },
//        /**
//         * @returns {*}
//         */
//        get_display_price: function () {
//            if (this.pos.config.iface_tax_included) {
//                return this.get_price_with_tax();
//            }
//            return OrderlineParent.prototype.get_display_price.apply(
//                this, arguments
//            );
//        },
//
//        export_as_JSON: function () {
//            var res = OrderlineParent.prototype.export_as_JSON.apply(this, arguments);
//            var product_tax_ids = this.get_product().taxes_id || [];
//            var partner = this.order ? this.order.get_client() : null;
//            if (partner && partner.property_account_position) {
//                product_tax_ids =
//                    this.pos.db.map_tax(
//                        partner.property_account_position[0], product_tax_ids
//                    );
//            }
//            res["tax_ids"] = [[6, false, product_tax_ids]];
//            return res;
//        }
//    });
//
//    /**
//     * Pricelist Engine to compute price
//     */
//    models.PricelistEngine = core.Class.extend({
//        /**
//         * @param options
//         */
//        init: function (options) {
//            options = options || {};
//            this.pos = options.pos;
//            this.db = options.db;
//            this.pos_widget = options.pos_widget;
//        },
//        /**
//         * compute price for all price list
//         * @param db
//         * @param product
//         * @param partner
//         * @param qty
//         * @returns {*}
//         */
//        compute_price_all: function (db, product, partner, qty) {
//            var price_list_id = false;
//            if (partner && partner.property_product_pricelist) {
//                price_list_id = partner.property_product_pricelist[0];
//            } else {
//                price_list_id = this.pos.config.pricelist_id[0];
//            }
//            return this.compute_price(
//                db, product, partner, qty, parseInt(price_list_id)
//            );
//        },
//        /**
//         * compute the price for the given product
//         * @param database
//         * @param product
//         * @param partner
//         * @param qty
//         * @param pricelist_id
//         * @returns {boolean}
//         */
//        compute_price: function (database, product, partner, qty, pricelist_id) {
//
//            var self = this;
//            var db = database;
//
//            // get categories
//            var categ_ids = [];
//            if (product.categ_id) {
//                categ_ids.push(product.categ_id[0]);
//                categ_ids = categ_ids.concat(
//                    db.product_category_ancestors[product.categ_id[0]]
//                );
//            }
//
//            // find items
//            var items = [], i, len;
//            for (i = 0, len = db.pricelist_item_sorted.length; i < len; i++) {
//                var item = db.pricelist_item_sorted[i];
//                if ((item.product_id === false
//                    || item.product_id[0] === product.id) &&
//                    (item.categ_id === false
//                    || categ_ids.indexOf(item.categ_id[0]) !== -1)) {
//                    items.push(item);
//                }
//            }
//
//            var results = {};
//            results[product.id] = 0.0;
//            var price_types = {};
//            var price = false;
//
//            // loop through items
//            for (i = 0, len = items.length; i < len; i++) {
//                var rule = items[i];
//
//                if (rule.min_quantity && qty < rule.min_quantity) {
//                    continue;
//                }
//                if (rule.product_id && rule.product_id[0]
//                    && product.id != rule.product_id[0]) {
//                    continue;
//                }
//                if (rule.categ_id) {
//                    var cat_id = product.categ_id[0];
//                    while (cat_id) {
//                        if (cat_id == rule.categ_id[0]) {
//                            break;
//                        }
//                        cat_id = db.product_category_by_id[cat_id].parent_id[0]
//                    }
//                    if (!(cat_id)) {
//                        continue;
//                    }
//                }
//                // Based on field
//                switch (rule.base) {
//                    case 'pricelist':
//                        if (rule.base_pricelist_id) {
//                            price = self.compute_price(
//                                db, product, false, qty,
//                                rule.base_pricelist_id[0]
//                            );
//                        }
//                        break;
//                    case 'standard_price':
//                        var seller = false;
//                        for (var index in product.seller_ids) {
//                            var seller_id = product.seller_ids[index];
//                            var _tmp_seller = db.supplierinfo_by_id[seller_id];
//                            if (_tmp_seller.name.length == 0)
//                                continue;
//                            seller = _tmp_seller
//                        }
//                        if (!seller && product.seller_ids) {
//                            seller =
//                                db.supplierinfo_by_id[product.seller_ids[0]];
//                        }
//                        if (seller) {
//                            if (seller.min_qty <= qty) {
//                                price = seller.price
//                            }
//                        }
//                        break;
//                    default:
//                        if (db.product_by_id[product.id]
//                                .hasOwnProperty('list_price')) {
//                            price =
//                                db.product_by_id[product.id]['list_price'];
//                        }
//                }
//                if (price !== false) {
//                    var price_limit = price;
//                    price = price * (rule['price_discount']
//                            ? rule['price_discount'] / 100
//                            : 1.0);
//                    if (rule['price_round']) {
//                        price = parseFloat(price.toFixed(
//                            Math.ceil(Math.log(1.0 / rule['price_round'])
//                                / Math.log(10)))
//                        );
//                    }
//                    price += (rule['price_surcharge']
//                        ? rule['price_surcharge']
//                        : 0.0);
//                    if (rule['price_min_margin']) {
//                        price = Math.max(
//                            price, price_limit + rule['price_min_margin']
//                        )
//                    }
//                    if (rule['price_max_margin']) {
//                        price = Math.min(
//                            price, price_limit + rule['price_min_margin']
//                        )
//                    }
//                }
//                break;
//            }
//            return price
//        },
//        /**
//         * @param partner
//         */
//        update_products_ui: function (partner) {
//            var db = this.db;
//            if (!this.pos_widget.product_screen) return;
//            var product_list_ui
//                = this.pos_widget.product_screen.$(
//                '.product-list span.product'
//            );
//            for (var i = 0, len = product_list_ui.length; i < len; i++) {
//                var product_ui = product_list_ui[i];
//                var product_id = $(product_ui).data('product-id');
//                var product = $.extend({}, db.get_product_by_id(product_id));
//                var rules = db.find_product_rules(product);
//                var quantities = [];
//                quantities.push(1);
//                for (var j = 0; j < rules.length; j++) {
//                    if ($.inArray(rules[j].min_quantity, quantities) === -1) {
//                        quantities.push(rules[j].min_quantity);
//                    }
//                }
//                quantities = quantities.sort();
//                var prices_displayed = '';
//                for (var k = 0; k < quantities.length; k++) {
//                    var qty = quantities[k];
//                    var price = this.compute_price_all(
//                        db, product, partner, qty
//                    );
//                    if (price !== false) {
//                        if (this.pos.config.iface_tax_included) {
//                            var prices = this.simulate_price(
//                                product, partner, price, qty
//                            );
//                            price = prices['priceWithTax']
//                        }
//                        price = round_di(parseFloat(price)
//                            || 0, this.pos.dp['Product Price']);
//                        price = this.pos_widget.format_currency(price);
//                        if (k == 0) {
//                            $(product_ui).find('.price-tag').html(price);
//                        }
//                        prices_displayed += qty
//                            + 'x &#8594; ' + price + '<br/>';
//                    }
//                }
//                if (prices_displayed != '') {
//                    $(product_ui).find('.price-tag').attr(
//                        'data-original-title', prices_displayed
//                    );
//                    $(product_ui).find('.price-tag').attr(
//                        'data-toggle', 'tooltip'
//                    );
//                    $(product_ui).find('.price-tag').tooltip(
//                        {delay: {show: 50, hide: 100}}
//                    );
//                }
//            }
//        },
//        simulate_price: function (product, partner, price, qty) {
//            // create a fake order in order to get price
//            // for this customer
//            var order = new models.Order({pos: this.pos});
//            order.set_client(partner);
//            var orderline = new openerp.point_of_sale.Orderline
//            ({}, {
//                pos: this.pos, order: order,
//                product: product, price: price
//            });
//            orderline.set_quantity(qty);
//            // reset the sequence
//            this.pos.pos_session.sequence_number--;
//            var prices = orderline.get_all_prices();
//            return prices;
//        },
//        /**
//         *
//         * @param partner
//         * @param orderLines
//         */
//        update_ticket: function (partner, orderLines) {
//            var db = this.db;
//            for (var i = 0, len = orderLines.length; i < len; i++) {
//                var line = orderLines[i];
//                var product = line.product;
//                var quantity = line.quantity;
//                var price = this.compute_price_all(
//                    db, product, partner, quantity
//                );
//                if (price !== false) {
//                    line.price = price;
//                }
//                line.trigger('change', line);
//            }
//        }
//    });
//    /**
//     * show error
//     * @param context
//     * @param message
//     * @param comment
//     */
//    function show_error(context, message, comment) {
//        context.pos.pos_widget.screen_selector.show_popup('error', {
//            'message': message,
//            'comment': comment
//        });
//    }
//
//    /**
//     * patch models to load some entities
//     * @param pos_model
//     */
//    function arrange_elements(pos_model) {
//
//        var product_model = pos_model.find_model('product.product');
//        if (_.size(product_model) == 1) {
//            var product_index = parseInt(Object.keys(product_model)[0]);
//            pos_model.models[product_index].fields.push(
//                'categ_id', 'seller_ids'
//            );
//        }
//
//        var res_product_pricelist = pos_model.find_model('product.pricelist');
//        if (_.size(res_product_pricelist) == 1) {
//            var pricelist_index = parseInt(Object.keys(
//                res_product_pricelist)[0]
//            );
//            pos_model.models.splice(++pricelist_index, 0,
//                {
//                    model: 'account.fiscal.position.tax',
//                    fields: ['display_name',
//                        'position_id',
//                        'tax_src_id',
//                        'tax_dest_id'],
//                    domain: null,
//                    loaded: function (self, fiscal_position_taxes) {
//                        self.db.add_fiscal_position_taxes(
//                            fiscal_position_taxes
//                        );
//                    }
//                },
//                {
//                    model: 'product.supplierinfo',
//                    fields: ['delay',
//                        'name',
//                        'min_qty',
//                        'product_code',
//                        'product_name',
//                        'sequence',
//                        'qty',
//                        'price',
//                        'product_tmpl_id'],
//                    domain: null,
//                    loaded: function (self, supplierinfos) {
//                        self.db.add_supplierinfo(supplierinfos);
//                    }
//                },
//                {
//                    model: 'product.category',
//                    fields: ['name',
//                        'display_name',
//                        'parent_id',
//                        'child_id'],
//                    domain: null,
//                    loaded: function (self, categories) {
//                        self.db.add_product_categories(categories);
//
//                    }
//                },
//                {
//                    model: 'product.pricelist',
//                    fields: ['display_name',
//                        'name',
//                        'version_id',
//                        'currency_id'],
//                    loaded: function (self, pricelists) {
//                        self.db.add_pricelists(pricelists);
//                    }
//                },
//                {
//                    model: 'product.pricelist.item',
//                    fields: ['name',
//                        'base',
//                        'base_pricelist_id',
//                        'categ_id',
//                        'fixed_price',
//                        'percent_price',
//                        'min_quantity',
//                        'price_discount',
//                        'price_max_margin',
//                        'price_min_margin',
//                        'price_round',
//                        'price_surcharge',
//                        'price_version_id',
//                        'product_id',
//                        'product_tmpl_id',
//                        'sequence'
//                    ],
//                    domain: null,
//                    loaded: function (self, items) {
//                        self.db.add_pricelist_items(items);
//                    }
//                }
//            );
//        }
//
//        var res_partner_model = pos_model.find_model('res.partner');
//        if (_.size(res_partner_model) == 1) {
//            var res_partner_index =
//                parseInt(Object.keys(res_partner_model)[0]);
//            pos_model.models[res_partner_index].fields.push(
//                'property_account_position',
//                'property_product_pricelist'
//            );
//        }
//
//    }
});

