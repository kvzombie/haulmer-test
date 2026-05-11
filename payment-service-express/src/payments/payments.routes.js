const { Router } = require('express');
const controller = require('./payments.controller');

const router = Router();

router.post('/',                    controller.createPayment);
router.get('/:transaction_id',      controller.getById);
router.get('/',                     controller.getMany);

module.exports = router;
