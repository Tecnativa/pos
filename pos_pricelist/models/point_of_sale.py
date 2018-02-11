# -*- coding: utf-8 -*-
# Copyright 2014-2015 Taktik - Adil Houmadi
# Copyright 2018 Tecnativa - David Vidal
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

from odoo import api, fields, models
from odoo.addons import decimal_precision as dp

import logging
_logger = logging.getLogger(__name__)


class PosOrderTax(models.Model):
    _name = 'pos.order.tax'

    pos_order = fields.Many2one(
        'pos.order',
        string='POS Order',
        ondelete='cascade',
        index=True,
    )
    tax_id = fields.Many2one(
        'account.tax',
        string='Tax',
        oldname='tax',
    )
    name = fields.Char(
        string='Tax Description',
        required=True,
    )
    base = fields.Float(
        string='Base',
        digits=dp.get_precision('Account'),
    )
    amount = fields.Float(
        string='Amount',
        digits=dp.get_precision('Account'),
    )

class PosOrder(models.Model):
    _inherit = "pos.order"

    taxes = fields.One2many(
        comodel_name='pos.order.tax',
        inverse_name='pos_order',
        readonly=True,
    )

    def _tax_list_get(self):
        agg_taxes = {}
        tax_lines = []
        for order in self:
            for line in order.lines.filtered('tax_ids'):
                tax_lines.append({
                    'base': line.price_subtotal,
                    'taxes': line.tax_ids
                })
        for tax_line in tax_lines:
            base = tax_line['base']
            for tax in tax_line['taxes']:
                tax_id = tax.id
                amount = tax.compute_all(base)['taxes'][0]['amount']
                if tax_id in agg_taxes:
                    agg_taxes[tax_id]['base'] += base
                    agg_taxes[tax_id]['amount'] += amount
                else:
                    agg_taxes[tax_id] = {
                        'tax_id': tax_id,
                        'name': tax['name'],
                        'base': base,
                        'amount': amount,
                    }
        return agg_taxes

    @api.multi
    def compute_tax_detail(self):
        taxes_to_delete = False
        for order in self:
            taxes_to_delete = self.env['pos.order.tax'].search(
                [('pos_order', '=', order.id)])
            # Update order taxes list
            for key, tax in order._tax_list_get().iteritems():
                current = taxes_to_delete.filtered(
                    lambda r: r.tax.id == tax['tax_id'])
                if current:
                    current.write({
                        'base': tax['base'],
                        'amount': tax['amount'],
                    })
                    taxes_to_delete -= current
                else:
                    self.env['pos.order.tax'].create({
                        'pos_order': order.id,
                        'tax': tax['tax_id'],
                        'name': tax['name'],
                        'base': tax['base'],
                        'amount': tax['amount'],
                    })
        if taxes_to_delete:
            taxes_to_delete.unlink()

    @api.multi
    def action_pos_order_paid(self):
        result = super(PosOrder, self).action_pos_order_paid()
        self.compute_tax_detail()
        return result

    @api.model
    def _install_tax_detail(self):
        """Create tax details to pos.order's already paid, done or invoiced.
        """
        # Find orders with state : paid, done or invoiced
        orders = self.search([('state', 'in', ('paid', 'done', 'invoiced')),
                              ('taxes', '=', False)])
        # Compute tax detail
        orders.compute_tax_detail()
        _logger.info("%d orders computed installing module.", len(orders))
