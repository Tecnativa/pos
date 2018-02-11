# -*- coding: utf-8 -*-
# Copyright 2014-2015 Taktik - Adil Houmadi
# Copyright 2016 Tecnativa - Pedro M. Baeza
# Copyright 2018 Tecnativa - David Vidal
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
{
    'name': 'POS Pricelist',
    'version': '10.0.1.0.0',
    'category': 'Point Of Sale',
    'author': 'Taktik, '
              'Tecnativa, '
              'Odoo Community Association (OCA)',
    'website': 'https://github.com/OCA/pos',
    'summary': 'Pricelist for Point of sale',
    'license': 'AGPL-3',
    'depends': [
        'point_of_sale',
    ],
    'data': [
        'views/pos_pricelist_template.xml',
        'views/point_of_sale_view.xml',
        'report/report_receipt.xml',
        'security/ir.model.access.csv',
        # 'security/account_fiscal_position_security.xml',
    ],
    'demo': [
        # 'demo/pos_pricelist_demo.yml',
    ],
    'qweb': [
        'static/src/xml/pos.xml'
    ],
    # 'post_init_hook': 'set_pos_line_taxes',
    'installable': True,
}
