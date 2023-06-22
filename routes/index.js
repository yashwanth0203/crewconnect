var express = require('express');
var router = express.Router();


router.get('/', async (req, res) => {
  res.render('index', { title : 'CrewConnect' });
});

router.get('/error', async (req, res) => {
  res.render('error', { title : 'Error' });
});

module.exports = router;
