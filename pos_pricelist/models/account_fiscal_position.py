# -*- coding: utf-8 -*-
# Copyright 2016 Tecnativa - Pedro M. Baeza
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

from odoo import fields, models


class AccountFiscalPositionTax(models.Model):
    _inherit = "account.fiscal.position.tax"

    company_id = fields.Many2one(
        related="position_id.company_id",
        string="Company",
    )
