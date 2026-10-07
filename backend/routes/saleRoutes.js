const router = require('express').Router();
const controller = require('../controllers/saleController');

router.get('/', controller.list);
router.get('/analytics', controller.analytics);
router.get('/:id', controller.getOne);
router.post('/', controller.create);

module.exports = router;
