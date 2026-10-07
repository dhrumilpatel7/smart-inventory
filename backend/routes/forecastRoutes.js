const router = require('express').Router();
const controller = require('../controllers/forecastController');

router.get('/', controller.list);
router.post('/run', controller.run);
router.get('/status', controller.status);
router.get('/summary', controller.summary);
router.get('/runs', controller.runs);
router.get('/product/:productId', controller.product);

module.exports = router;
