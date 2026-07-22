const { app } = require('electron');
const path = require('path');

app.setName('Sanny Desktop');
app.setPath('userData', path.join(app.getPath('appData'), 'Sanny Desktop'));

require('./main');
