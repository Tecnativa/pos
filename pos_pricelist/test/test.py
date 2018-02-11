# # -*- coding: utf-8 -*-
# # Copyright (C) 2014 Taktik (http://www.taktik.be)
#
# from odoo.tests import common
#
#
# @odoo.tests.common.at_install(False)
# @odoo.tests.common.post_install(True)
# class TestPOS(common.HttpCase):
#     def test_01_pos(self):
#         self.phantom_js("/", "openerp.Tour.run('pos_pricelist_order', 'test')",
#                         "openerp.Tour.tours.pos_pricelist_order",
#                         login="admin")
