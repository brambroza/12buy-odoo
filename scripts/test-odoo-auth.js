const xmlrpc = require('xmlrpc');

require('dotenv').config({ path: '.env' });

const url = process.env.ODOO_URL;
const db = process.env.ODOO_DB;
const username = process.env.ODOO_USERNAME;
const password = process.env.ODOO_API_KEY;

console.log({
  url,
  db,
  username,
  hasPassword: Boolean(password),
});

const client = xmlrpc.createClient({
  url: `${url}/xmlrpc/2/common`,
});

client.methodCall(
  'authenticate',
  [db, username, password, {}],
  (err, uid) => {
    if (err) {
      console.error('XML-RPC error:', err);
      return;
    }

    console.log('uid:', uid);

    if (!uid) {
      console.log('Auth failed: check ODOO_DB, ODOO_USERNAME, ODOO_API_KEY');
    } else {
      console.log('Auth success');
    }
  }
);
