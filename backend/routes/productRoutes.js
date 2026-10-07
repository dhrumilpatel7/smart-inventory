const router = require('express').Router();
const controller = require('../controllers/productController');
const { authorize } = require('../middleware/auth');

router.get('/', controller.list);
router.get('/categories', controller.categories);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', authorize('admin'), controller.remove);

module.exports = router;
