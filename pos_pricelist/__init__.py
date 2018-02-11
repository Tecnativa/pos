# -*- coding: utf-8 -*-
# Copyright 2014-2015 Taktik - Adil Houmadi
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

from . import models
from odoo import api, SUPERUSER_ID


def set_pos_line_taxes(cr, registry):
    """Copy the product taxes to the pos.line"""
    env = api.Environment(cr, SUPERUSER_ID, {})
    cr.execute("""insert into pline_tax_rel
                    select l.id, t.id
                    from pos_order_line l
                    join pos_order o on l.order_id = o.id
                    join product_product p on l.product_id = p.id
                    join product_template pt on pt.id = p.product_tmpl_id
                    join product_taxes_rel rel on rel.prod_id = pt.id
                    join account_tax t on rel.tax_id = t.id
                    where t.company_id = o.company_id""")
    env['pos.order']._install_tax_detail()
