const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const serviceAccount = require("./firebase-credentials.js");

const app = initializeApp({
  credential: cert(serviceAccount)
});

module.exports = {
  auth: () => getAuth(app)
};
