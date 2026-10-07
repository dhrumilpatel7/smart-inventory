const router = require('express').Router();
const controller = require('../controllers/purchaseOrderController');

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id/status', controller.updateStatus);

module.exports = router;
